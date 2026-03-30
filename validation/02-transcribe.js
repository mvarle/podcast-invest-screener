/**
 * Phase 0, Step 2: Transcribe episode using Deepgram
 * Reads: validation/output/episode.json (audio URL)
 * Outputs: validation/output/transcript.json (full Deepgram response)
 *          validation/output/transcript.txt (readable transcript)
 *
 * Passes the audio URL directly to Deepgram — no download needed.
 */

require("dotenv").config();
const { DeepgramClient } = require("@deepgram/sdk");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "output");

async function transcribe() {
  // Validate API key
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey || apiKey === "your_deepgram_api_key_here") {
    console.error(
      "Error: Set DEEPGRAM_API_KEY in .env file (copy from .env.example)"
    );
    process.exit(1);
  }

  // Load episode data
  const episodePath = path.join(OUTPUT_DIR, "episode.json");
  if (!fs.existsSync(episodePath)) {
    console.error("Error: Run 01-fetch-episode.js first");
    process.exit(1);
  }
  const episode = JSON.parse(fs.readFileSync(episodePath, "utf-8"));

  console.log(`Transcribing: "${episode.title}"`);
  console.log(`Audio URL: ${episode.audioUrl}`);
  console.log(`Duration: ${episode.duration}`);
  console.log("\nSending to Deepgram (this may take 2-5 minutes)...\n");

  const deepgram = new DeepgramClient({
    apiKey,
    timeoutInSeconds: 600, // 10 minutes for long podcasts
  });

  const startTime = Date.now();

  const result = await deepgram.listen.v1.media.transcribeUrl({
    url: episode.audioUrl,
    model: "nova-2",
    language: "da",
    diarize: true,
    punctuate: true,
    paragraphs: true,
    utterances: true,
    smart_format: true,
    keywords: [
      "Novo Nordisk:2", "Carlsberg:2", "Mærsk:2", "Vestas:2",
      "Danske Bank:2", "Nordea:2", "Pandora:2", "Coloplast:2",
      "Ørsted:2", "Demant:2", "Genmab:2", "Bavarian Nordic:2",
      "Jyske Bank:2", "Netcompany:2", "Equinor:2", "Accenture:2",
      "ChemoMetec:2", "Lundbeck:2", "Rockwool:2", "FLSmidth:2",
      "Topdanmark:2", "Zealand Pharma:2", "Royal Unibrew:2",
      "Scandinavian Tobacco:2", "Universal Display:2",
      "Marvell:2", "Broadcom:2", "Corning:2", "Micron:2",
    ],
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Transcription completed in ${elapsed}s\n`);

  // Save full Deepgram response
  const rawPath = path.join(OUTPUT_DIR, "transcript-raw.json");
  fs.writeFileSync(rawPath, JSON.stringify(result, null, 2));
  console.log(`Full Deepgram response saved to: ${rawPath}`);

  // Build readable transcript with speaker labels
  const utterances = result.results?.utterances || [];
  const paragraphs =
    result.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs ||
    [];

  let readableTranscript = "";

  if (utterances.length > 0) {
    // Use utterances (better for diarized output)
    readableTranscript = utterances
      .map((u) => {
        const minutes = Math.floor(u.start / 60);
        const seconds = Math.floor(u.start % 60)
          .toString()
          .padStart(2, "0");
        return `[${minutes}:${seconds}] Speaker ${u.speaker}: ${u.transcript}`;
      })
      .join("\n\n");
  } else if (paragraphs.length > 0) {
    // Fallback to paragraphs
    readableTranscript = paragraphs
      .map((p) => {
        const speaker = p.speaker !== undefined ? `Speaker ${p.speaker}` : "Unknown";
        const sentences = p.sentences?.map((s) => s.text).join(" ") || "";
        return `${speaker}: ${sentences}`;
      })
      .join("\n\n");
  } else {
    // Fallback to raw transcript
    readableTranscript =
      result.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  }

  const txtPath = path.join(OUTPUT_DIR, "transcript.txt");
  fs.writeFileSync(txtPath, readableTranscript);

  // Stats
  const wordCount = readableTranscript.split(/\s+/).length;
  const speakerSet = new Set(utterances.map((u) => u.speaker));

  console.log(`Readable transcript saved to: ${txtPath}`);
  console.log(`\n── Transcript Stats ──`);
  console.log(`Words: ${wordCount.toLocaleString()}`);
  console.log(`Speakers detected: ${speakerSet.size}`);
  console.log(`Utterances: ${utterances.length}`);
  console.log(
    `Confidence: ${(result.results?.channels?.[0]?.alternatives?.[0]?.confidence * 100)?.toFixed(1)}%`
  );

  // Show first few utterances as preview
  console.log(`\n── Preview (first 5 utterances) ──`);
  utterances.slice(0, 5).forEach((u) => {
    const minutes = Math.floor(u.start / 60);
    const seconds = Math.floor(u.start % 60)
      .toString()
      .padStart(2, "0");
    console.log(
      `[${minutes}:${seconds}] Speaker ${u.speaker}: ${u.transcript.substring(0, 120)}...`
    );
  });

  console.log(
    "\nNext step: Run 03-extract.js to send the transcript to Claude for stock mention extraction."
  );
}

transcribe().catch((err) => {
  console.error("Error during transcription:", err.message);
  process.exit(1);
});
