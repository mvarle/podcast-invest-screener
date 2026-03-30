/**
 * Phase 0, Step 3: Extract stock mentions from transcript using Claude
 * Reads: validation/output/transcript.txt
 * Outputs: validation/output/extraction.json (structured stock mentions)
 *
 * Uses Claude Sonnet with tool_use for guaranteed valid JSON.
 */

require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "output");

// Define the extraction schema as a Claude tool
const EXTRACTION_TOOL = {
  name: "record_stock_mentions",
  description:
    "Record all stock mentions extracted from a podcast transcript with their sentiment and context.",
  input_schema: {
    type: "object",
    properties: {
      stock_mentions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company_name: {
              type: "string",
              description:
                "The company name as discussed in the podcast.",
            },
            ticker: {
              type: "string",
              description:
                "Stock ticker if confidently known (e.g., NOVO-B.CO, AAPL). Use null if unsure.",
            },
            sentiment: {
              type: "string",
              enum: ["bullish", "bearish", "hold"],
              description: "The speaker's net directional view on this stock.",
            },
            mention_type: {
              type: "string",
              enum: [
                "investment_call",
                "comparison",
                "passing_mention",
                "news_reference",
              ],
            },
            confidence: {
              type: "number",
              description:
                "Extraction confidence (0.0-1.0). Reflects ONLY transcript parsing clarity — NOT how hedged the speaker was.",
            },
            speaker: {
              type: "string",
              description:
                "Speaker name. Use known host/guest names when identifiable. Use 'Unknown Guest' for unidentifiable speakers.",
            },
            timestamp: {
              type: "string",
              description:
                "Approximate timestamp from the transcript (e.g., '12:30').",
            },
            quote: {
              type: "string",
              description:
                "2-4 sentence CONTIGUOUS excerpt from the transcript (in original Danish). Must be an actual passage, not stitched from multiple segments.",
            },
            reasoning: {
              type: "string",
              description:
                "Brief analytical explanation in English. Describe the speaker's argument. Do NOT translate the Danish quote.",
            },
            call_summary: {
              type: "string",
              description:
                "A single sentence of original financial analysis summarizing the speaker's position. NOT a translation of the quote. Example: 'Sees current valuation as attractive following the 40% pullback, expecting GLP-1 demand to drive a guidance raise.'",
            },
            conviction_strength: {
              type: "string",
              enum: ["strong", "moderate", "tentative"],
              description:
                "strong = first-person action language, no hedging. moderate = directional lean with qualification. tentative = musing, hypothetical, or responding to a question. When in doubt, choose the lower level.",
            },
          },
          required: [
            "company_name",
            "sentiment",
            "mention_type",
            "confidence",
            "speaker",
            "quote",
            "reasoning",
            "call_summary",
            "conviction_strength",
          ],
        },
      },
      episode_summary: {
        type: "string",
        description:
          "Brief 2-3 sentence summary of the episode's main investment topics (in English).",
      },
      speakers_identified: {
        type: "array",
        items: {
          type: "object",
          properties: {
            speaker_label: {
              type: "string",
              description: "The diarization label (e.g., 'Speaker 0')",
            },
            likely_name: {
              type: "string",
              description:
                "The person's actual name if identifiable from context",
            },
            role: {
              type: "string",
              description: "Host, guest, analyst, etc.",
            },
          },
          required: ["speaker_label"],
        },
      },
    },
    required: ["stock_mentions", "episode_summary", "speakers_identified"],
  },
};

const SYSTEM_PROMPT = `You are a conservative financial analyst reviewing a Danish investment podcast transcript. Your priority is ACCURACY over COMPLETENESS. It is far better to miss a mention than to misattribute sentiment or fabricate a call.

MENTION TYPE CLASSIFICATION (apply in order):
1. Does the speaker explicitly state they would buy, sell, or hold? → "investment_call"
2. Clear directional opinion as main discussion topic? → "investment_call"
3. Contrasting with another stock? → "comparison"
4. Reporting news/earnings without personal view? → "news_reference"
5. Brief mention without opinion? → "passing_mention" (skip unless clear sentiment)
DEFAULT: When in doubt, choose "news_reference" over "investment_call".

CONVICTION STRENGTH:
- "strong": First-person action language, NO hedging. "Jeg har købt", "Det er et klart køb"
- "moderate": Directional lean with qualification. "Jeg tror den er interessant", "Der burde være potentiale"
- "tentative": Musing, hypothetical, responding to question. "Hvis man skulle...", "Man kunne overveje..."
When in doubt, choose the lower level.

CONFIDENCE vs CONVICTION — SEPARATE dimensions:
- confidence: How clearly could we parse the transcript? (transcription quality, speaker clarity, unambiguous company reference). NOT about how hedged the speaker was.
- conviction_strength: How strongly the speaker expressed their view. NOT about transcription quality.

DANISH CALIBRATION: Danish speakers understate. "Ret interessant" ≈ genuine enthusiasm (moderate+). "Jeg er tæt på at købe" ≈ strong purchase intent (strong).

TRANSCRIPT ARTIFACTS: Auto-generated transcript may contain errors. "Envidia" = NVIDIA, "SMS" = ASML, "dåb" = Adobe, "microron" = Micron. "bear" may be "bare" (just/only). Only extract genuine company discussions, not transcription artifacts.

QUOTES: Must be actual CONTIGUOUS passages in original Danish. Do NOT stitch utterances from different timestamps.

CALL_SUMMARY: Write as original financial analysis, NOT a translation of the Danish quote.

SPEAKER ID: Map "Speaker N" to real names from context. Use "Unknown Guest" if unidentifiable.

IGNORE: Sponsor/ad segments, trivial passing mentions, transcript artifacts.`;


async function extract() {
  // Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "your_anthropic_api_key_here") {
    console.error(
      "Error: Set ANTHROPIC_API_KEY in .env file (copy from .env.example)"
    );
    process.exit(1);
  }

  // Load transcript
  const transcriptPath = path.join(OUTPUT_DIR, "transcript.txt");
  if (!fs.existsSync(transcriptPath)) {
    console.error("Error: Run 02-transcribe.js first");
    process.exit(1);
  }
  const transcript = fs.readFileSync(transcriptPath, "utf-8");
  const wordCount = transcript.split(/\s+/).length;

  // Load episode metadata
  const episodePath = path.join(OUTPUT_DIR, "episode.json");
  const episode = JSON.parse(fs.readFileSync(episodePath, "utf-8"));

  console.log(`Extracting stock mentions from: "${episode.title}"`);
  console.log(`Transcript length: ${wordCount.toLocaleString()} words`);
  console.log("\nSending to Claude Sonnet (this may take 30-60s)...\n");

  const client = new Anthropic();

  const startTime = Date.now();

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "record_stock_mentions" },
    messages: [
      {
        role: "user",
        content: `Here is the transcript of the Danish investment podcast episode "${episode.title}" (published ${episode.pubDate}):\n\n${transcript}`,
      },
    ],
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Claude extraction completed in ${elapsed}s`);
  console.log(
    `Tokens used: ${response.usage.input_tokens.toLocaleString()} input, ${response.usage.output_tokens.toLocaleString()} output`
  );

  // Extract the tool use result
  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse) {
    console.error("Error: Claude did not return a tool_use response");
    console.error("Response:", JSON.stringify(response.content, null, 2));
    process.exit(1);
  }

  const extraction = toolUse.input;

  // Save full extraction
  const outputPath = path.join(OUTPUT_DIR, "extraction.json");
  fs.writeFileSync(outputPath, JSON.stringify(extraction, null, 2));
  console.log(`\nFull extraction saved to: ${outputPath}`);

  // Display results
  console.log("\n" + "═".repeat(70));
  console.log("EXTRACTION RESULTS");
  console.log("═".repeat(70));

  console.log(`\n📋 Episode Summary:`);
  console.log(`   ${extraction.episode_summary}\n`);

  console.log(`🎙️ Speakers Identified:`);
  extraction.speakers_identified?.forEach((s) => {
    console.log(
      `   ${s.speaker_label} → ${s.likely_name || "Unknown"} (${s.role || "unknown role"})`
    );
  });

  console.log(
    `\n📊 Stock Mentions: ${extraction.stock_mentions?.length || 0} total`
  );

  const investmentCalls = extraction.stock_mentions?.filter(
    (m) => m.mention_type === "investment_call"
  );
  const comparisons = extraction.stock_mentions?.filter(
    (m) => m.mention_type === "comparison"
  );
  const passingMentions = extraction.stock_mentions?.filter(
    (m) => m.mention_type === "passing_mention"
  );
  const newsRefs = extraction.stock_mentions?.filter(
    (m) => m.mention_type === "news_reference"
  );

  console.log(
    `   Investment calls: ${investmentCalls?.length || 0} | Comparisons: ${comparisons?.length || 0} | Passing: ${passingMentions?.length || 0} | News: ${newsRefs?.length || 0}`
  );

  if (investmentCalls?.length > 0) {
    console.log("\n" + "─".repeat(70));
    console.log("INVESTMENT CALLS (these would be tracked):");
    console.log("─".repeat(70));

    investmentCalls.forEach((m, i) => {
      const sentimentEmoji =
        m.sentiment === "bullish"
          ? "🟢"
          : m.sentiment === "bearish"
            ? "🔴"
            : "🟡";
      console.log(
        `\n  ${i + 1}. ${sentimentEmoji} ${m.company_name} (${m.ticker || "no ticker"}) — ${m.sentiment.toUpperCase()}`
      );
      console.log(
        `     Speaker: ${m.speaker} | Conviction: ${m.conviction_strength} | Confidence: ${(m.confidence * 100).toFixed(0)}%`
      );
      console.log(`     Timestamp: ${m.timestamp || "unknown"}`);
      console.log(`     Call Summary: ${m.call_summary || "(none)"}`);
      console.log(`     Quote: "${m.quote?.substring(0, 200)}..."`);
      console.log(`     Reasoning: ${m.reasoning}`);
    });
  }

  // Quality assessment
  console.log("\n" + "═".repeat(70));
  console.log("QUALITY ASSESSMENT");
  console.log("═".repeat(70));

  const avgConfidence =
    extraction.stock_mentions?.length > 0
      ? extraction.stock_mentions.reduce((sum, m) => sum + m.confidence, 0) /
        extraction.stock_mentions.length
      : 0;

  console.log(`\n  Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
  console.log(
    `  Investment calls found: ${investmentCalls?.length || 0}`
  );
  console.log(
    `  Speakers identified by name: ${extraction.speakers_identified?.filter((s) => s.likely_name).length || 0}/${extraction.speakers_identified?.length || 0}`
  );

  const estimatedCost = (
    (response.usage.input_tokens * 0.003 +
      response.usage.output_tokens * 0.015) /
    1000
  ).toFixed(4);
  console.log(`  Estimated API cost: $${estimatedCost}`);

  console.log("\n  Review the extraction.json file to evaluate quality.");
  console.log(
    "  Compare extracted mentions against the transcript to verify accuracy."
  );
  console.log(
    '\n  If quality is acceptable (>85% accuracy), Phase 0 is validated! ✓'
  );
}

extract().catch((err) => {
  console.error("Error during extraction:", err.message);
  process.exit(1);
});
