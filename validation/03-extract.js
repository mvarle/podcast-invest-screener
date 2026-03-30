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
                "The company name as mentioned in the podcast (in Danish or English)",
            },
            ticker: {
              type: "string",
              description:
                "Stock ticker symbol if confidently known (e.g., NVO, NOVO-B.CO). Use null if unsure.",
            },
            sentiment: {
              type: "string",
              enum: ["bullish", "bearish", "hold"],
              description: "The speaker's sentiment toward this stock",
            },
            mention_type: {
              type: "string",
              enum: [
                "investment_call",
                "comparison",
                "passing_mention",
                "news_reference",
              ],
              description:
                "investment_call = speaker expresses a directional opinion they would act on. comparison = mentioned to contrast with main topic. passing_mention = brief reference without opinion. news_reference = reporting news without personal view.",
            },
            confidence: {
              type: "number",
              description:
                "Confidence in the extraction accuracy (0.0-1.0). Lower if sentiment is ambiguous or hedged.",
            },
            speaker: {
              type: "string",
              description:
                "Speaker name if identifiable from the transcript, otherwise 'Speaker N' from diarization.",
            },
            timestamp: {
              type: "string",
              description:
                "Approximate timestamp in the transcript (e.g., '12:30')",
            },
            quote: {
              type: "string",
              description:
                "2-4 sentence excerpt from the transcript (in Danish) capturing the key opinion. Keep the original language.",
            },
            reasoning: {
              type: "string",
              description:
                "Brief explanation of why this sentiment was assigned (in English). Include the speaker's rationale if stated.",
            },
            conviction_strength: {
              type: "string",
              enum: ["strong", "moderate", "tentative"],
              description:
                "How strongly the speaker expressed this opinion. strong = definitive recommendation, moderate = clear lean, tentative = hedged/conditional.",
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

const SYSTEM_PROMPT = `You are a financial analyst reviewing a Danish investment podcast transcript. Your task is to extract all stock mentions with their associated sentiment, speaker attribution, and supporting quotes.

RULES:
1. Carefully distinguish between mention types:
   - "investment_call": The speaker expresses a clear directional opinion they would act on (e.g., "Jeg ville købe Novo Nordisk her", "Vi er meget positive på Vestas")
   - "comparison": Stock mentioned to contrast with the main topic (e.g., "I modsætning til Carlsberg, som har været flad...")
   - "passing_mention": Brief reference without substantive opinion
   - "news_reference": Reporting news/earnings without personal view

2. For each investment_call, capture the speaker's reasoning if stated.

3. If a speaker changes their mind during the episode, create TWO separate entries with different timestamps.

4. If sentiment is heavily hedged or ambiguous, use "hold" with confidence < 0.5.

5. Keep quotes in the ORIGINAL Danish. Do not translate quotes.

6. Write reasoning in English.

7. For tickers: only include if you are confident of the exact ticker symbol. For Danish stocks, use Copenhagen exchange tickers (e.g., NOVO-B.CO, CARL-B.CO, MAERSK-B.CO). If unsure, leave ticker as null — the company_name is more important.

8. Try to identify speakers by name from the transcript context (introductions, when hosts address each other by name). Map diarization labels (Speaker 0, Speaker 1) to actual names where possible.

9. Focus on QUALITY over QUANTITY. Only extract mentions where there is genuine investment-relevant content. Skip trivial passing mentions of company names.`;

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
