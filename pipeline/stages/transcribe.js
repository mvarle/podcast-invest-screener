/**
 * Stage 2: Transcription
 * Picks up episodes with status 'pending_transcription',
 * sends audio URL to Deepgram, stores transcript in Supabase.
 */

const { DeepgramClient } = require("@deepgram/sdk");
const { supabase } = require("../supabase-client");
const { applyCorrections } = require("../transcript-corrections");

const MAX_RETRIES = 5;
const MIN_KEYWORD_LENGTH = 5; // Skip short names that cause substitution artifacts

async function transcribe() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set");

  const deepgram = new DeepgramClient({
    apiKey,
    timeoutInSeconds: 600,
  });

  // Get pending episodes
  const { data: episodes, error } = await supabase
    .from("episodes")
    .select("*")
    .eq("status", "pending_transcription")
    .lt("retry_count", MAX_RETRIES)
    .order("release_date", { ascending: false })
    .limit(5); // Process 5 at a time

  if (error) throw new Error(`Failed to fetch episodes: ${error.message}`);
  if (!episodes?.length) {
    console.log("No episodes pending transcription.");
    return;
  }

  // Build keyword boosting from stock_tickers table
  const { data: tickers } = await supabase
    .from("stock_tickers")
    .select("common_names")
    .eq("is_active", true);

  const keywords = [];
  for (const t of tickers || []) {
    for (const name of t.common_names) {
      if (name.length >= MIN_KEYWORD_LENGTH) {
        keywords.push(`${name}:2`);
      }
    }
  }
  console.log(`  Loaded ${keywords.length} keyword boosts from stock_tickers\n`);

  console.log(`${episodes.length} episodes to transcribe\n`);

  for (const episode of episodes) {
    console.log(`  Transcribing: "${episode.title}"`);
    const startTime = Date.now();

    try {
      const result = await deepgram.listen.v1.media.transcribeUrl({
        url: episode.audio_url,
        model: "nova-2",
        language: "da",
        diarize: true,
        punctuate: true,
        paragraphs: true,
        utterances: true,
        smart_format: true,
        keywords,
      });

      // Build readable transcript from utterances
      const utterances = result.results?.utterances || [];
      let transcriptText = "";

      if (utterances.length > 0) {
        transcriptText = utterances
          .map((u) => {
            const mins = Math.floor(u.start / 60);
            const secs = Math.floor(u.start % 60).toString().padStart(2, "0");
            return `[${mins}:${secs}] Speaker ${u.speaker}: ${u.transcript}`;
          })
          .join("\n\n");
      } else {
        transcriptText =
          result.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
      }

      // Apply post-processing corrections for known Deepgram errors
      transcriptText = applyCorrections(transcriptText);

      const wordCount = transcriptText.split(/\s+/).length;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Store transcript
      const { error: txErr } = await supabase.from("transcripts").insert({
        episode_id: episode.id,
        content: transcriptText,
        raw_deepgram_json: result,
        word_count: wordCount,
        language: "da",
      });

      if (txErr) throw new Error(`Transcript insert failed: ${txErr.message}`);

      // Update episode status
      await supabase
        .from("episodes")
        .update({ status: "transcription_complete" })
        .eq("id", episode.id);

      console.log(`    Done in ${elapsed}s — ${wordCount.toLocaleString()} words, ${utterances.length} utterances`);
    } catch (err) {
      console.error(`    Error: ${err.message}`);

      const newRetry = (episode.retry_count || 0) + 1;
      const nextRetryAt = new Date(
        Date.now() + Math.pow(2, newRetry) * 60000
      ).toISOString();

      await supabase
        .from("episodes")
        .update({
          status: newRetry >= MAX_RETRIES ? "failed" : "pending_transcription",
          error_message: err.message,
          retry_count: newRetry,
          next_retry_at: nextRetryAt,
        })
        .eq("id", episode.id);

      console.error(`    Retry ${newRetry}/${MAX_RETRIES}. Next retry at: ${nextRetryAt}`);
    }
  }
}

module.exports = { transcribe };
