/**
 * Stage 3: Extraction
 * Picks up episodes with status 'transcription_complete',
 * sends transcript to Claude for structured stock mention extraction,
 * resolves tickers via lookup table, stores mentions in Supabase.
 */

const Anthropic = require("@anthropic-ai/sdk");
const { supabase } = require("../supabase-client");

const MAX_RETRIES = 5;

const EXTRACTION_TOOL = {
  name: "record_stock_mentions",
  description:
    "Record all stock mentions extracted from a podcast transcript.",
  input_schema: {
    type: "object",
    properties: {
      stock_mentions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company_name: { type: "string" },
            ticker: { type: "string", description: "Ticker if known, or null" },
            sentiment: { type: "string", enum: ["bullish", "bearish", "hold"] },
            mention_type: {
              type: "string",
              enum: ["investment_call", "comparison", "passing_mention", "news_reference"],
            },
            confidence: { type: "number" },
            speaker: { type: "string" },
            timestamp: { type: "string" },
            quote: { type: "string" },
            reasoning: { type: "string" },
            conviction_strength: {
              type: "string",
              enum: ["strong", "moderate", "tentative"],
            },
          },
          required: ["company_name", "sentiment", "mention_type", "confidence", "speaker", "quote", "reasoning", "conviction_strength"],
        },
      },
      episode_summary: { type: "string" },
    },
    required: ["stock_mentions", "episode_summary"],
  },
};

const SYSTEM_PROMPT = `You are a financial analyst reviewing a Danish investment podcast transcript. Extract all stock mentions with sentiment, speaker attribution, and supporting quotes.

RULES:
1. Classify mention types:
   - "investment_call": Speaker expresses a directional opinion they would act on
   - "comparison": Mentioned to contrast with main topic
   - "passing_mention": Brief reference without opinion
   - "news_reference": Reporting news without personal view

2. If a speaker changes their mind, create TWO entries with different timestamps.
3. If sentiment is heavily hedged, use "hold" with confidence < 0.5.
4. Keep quotes in ORIGINAL Danish. Write reasoning in English.
5. For tickers: only include if confident. Danish stocks use Copenhagen tickers (e.g., NOVO-B.CO). If unsure, leave null.
6. SPEAKER IDENTIFICATION:
   - A list of known hosts/guests for this podcast is provided at the top of the transcript. Use it to map "Speaker N" IDs to real names.
   - Look for introductions near the start where hosts greet guests by name and match those to speaker IDs.
   - If a speaker mentions their own name or is addressed by name, use that.
   - For sponsor/ad segments (typically first 30-60 seconds, or containing "sponsoreret af", "Saxo Bank aktiesparekonto", etc.), label the speaker as "Sponsor" — do NOT extract stock mentions from sponsor ads.
   - For truly unidentifiable speakers, use "Unknown Guest" rather than "Speaker N".
7. Focus on QUALITY over QUANTITY. Skip trivial passing mentions.
8. IGNORE SPONSOR/AD SEGMENTS: Do not extract stock mentions from sponsor or advertisement segments. These are typically at the very start (first ~60 seconds) and mid-roll ads. Indicators include: promotional language, "sponsoreret af", website URLs, "opret din konto", "bedst i test".
9. TRANSCRIPT ARTIFACTS: The transcript is auto-generated and may contain errors, especially for company names (e.g., "Envidia" = NVIDIA, "koloplast" = Coloplast, "SMS" = ASML, "dåb" = Adobe, "microron" = Micron). Use context to identify the actual company being discussed.`;

async function extract() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const client = new Anthropic();

  // Get episodes ready for extraction
  const { data: episodes, error } = await supabase
    .from("episodes")
    .select("*")
    .eq("status", "transcription_complete")
    .lt("retry_count", MAX_RETRIES)
    .order("release_date", { ascending: false })
    .limit(5);

  if (error) throw new Error(`Failed to fetch episodes: ${error.message}`);
  if (!episodes?.length) {
    console.log("No episodes pending extraction.");
    return;
  }

  // Load ticker lookup table
  const { data: tickers } = await supabase
    .from("stock_tickers")
    .select("*")
    .eq("is_active", true);

  const tickerLookup = buildTickerLookup(tickers || []);

  console.log(`${episodes.length} episodes to extract\n`);

  // Pre-fetch podcast hosts for speaker identification
  const podcastHostsCache = new Map();

  for (const episode of episodes) {
    // Fetch transcript separately
    const { data: txData } = await supabase
      .from("transcripts")
      .select("content")
      .eq("episode_id", episode.id)
      .single();

    const transcript = txData?.content;
    if (!transcript) {
      console.log(`  Skipping "${episode.title}" — no transcript found`);
      continue;
    }

    // Fetch podcast hosts (cached per podcast)
    let hosts = podcastHostsCache.get(episode.podcast_id);
    if (hosts === undefined) {
      const { data: podcastData } = await supabase
        .from("podcasts")
        .select("hosts")
        .eq("id", episode.podcast_id)
        .single();
      hosts = podcastData?.hosts || [];
      podcastHostsCache.set(episode.podcast_id, hosts);
    }

    console.log(`  Extracting: "${episode.title}"`);
    const startTime = Date.now();

    // Build host context for Claude
    let hostContext = "";
    if (hosts.length > 0) {
      const hostList = hosts.map((h) => `- ${h.name} (${h.role})`).join("\n");
      hostContext = `KNOWN HOSTS AND REGULAR GUESTS FOR THIS PODCAST:\n${hostList}\n\nUse this list to identify speakers in the transcript. Match "Speaker N" labels to real names based on introductions and context.\n\n`;
    }

    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: "record_stock_mentions" },
        messages: [
          {
            role: "user",
            content: `${hostContext}Transcript of "${episode.title}" (${episode.release_date}):\n\n${transcript}`,
          },
        ],
      });

      const toolUse = response.content.find((c) => c.type === "tool_use");
      if (!toolUse) throw new Error("Claude did not return tool_use response");

      const extraction = toolUse.input;
      const mentions = extraction.stock_mentions || [];
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`    Claude returned ${mentions.length} mentions in ${elapsed}s`);
      console.log(`    Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

      // Resolve tickers and extract surrounding transcript context
      const rows = mentions.map((m) => {
        const resolved = resolveCompany(m.company_name, tickerLookup);
        const context = extractContext(transcript, m.timestamp, m.quote);
        return {
          episode_id: episode.id,
          ticker: m.ticker || resolved?.ticker || null,
          company_name: resolved?.company_name || m.company_name,
          exchange: resolved?.exchange || null,
          sentiment: m.sentiment,
          mention_type: m.mention_type,
          confidence: m.confidence,
          conviction_strength: m.conviction_strength,
          speaker: m.speaker,
          timestamp_in_transcript: m.timestamp || null,
          quote: m.quote,
          reasoning: m.reasoning,
          transcript_context: context,
        };
      });

      if (rows.length > 0) {
        const { error: insertErr } = await supabase
          .from("stock_mentions")
          .insert(rows);

        if (insertErr) throw new Error(`Mention insert failed: ${insertErr.message}`);
      }

      // Update episode status
      await supabase
        .from("episodes")
        .update({ status: "analysis_complete" })
        .eq("id", episode.id);

      const investmentCalls = mentions.filter((m) => m.mention_type === "investment_call");
      console.log(`    Stored: ${rows.length} mentions (${investmentCalls.length} investment calls)`);
    } catch (err) {
      console.error(`    Error: ${err.message}`);

      const newRetry = (episode.retry_count || 0) + 1;
      const nextRetryAt = new Date(
        Date.now() + Math.pow(2, newRetry) * 60000
      ).toISOString();

      await supabase
        .from("episodes")
        .update({
          status: newRetry >= MAX_RETRIES ? "failed" : "transcription_complete",
          error_message: err.message,
          retry_count: newRetry,
          next_retry_at: nextRetryAt,
        })
        .eq("id", episode.id);

      console.error(`    Retry ${newRetry}/${MAX_RETRIES}`);
    }
  }
}

/**
 * Build a lookup map from company common names to ticker info.
 */
function buildTickerLookup(tickers) {
  const lookup = new Map();
  for (const t of tickers) {
    for (const name of t.common_names) {
      lookup.set(name.toLowerCase(), {
        company_name: t.company_name,
        ticker: t.ticker_primary || t.ticker_copenhagen || t.ticker_nyse,
        exchange: t.exchange || (t.ticker_copenhagen ? "CPH" : t.ticker_nyse ? "NYSE" : null),
      });
    }
  }
  return lookup;
}

/**
 * Try to resolve a company name from Claude to our ticker table.
 */
function resolveCompany(name, lookup) {
  if (!name) return null;
  const exact = lookup.get(name.toLowerCase());
  if (exact) return exact;
  for (const [key, value] of lookup) {
    if (name.toLowerCase().includes(key) || key.includes(name.toLowerCase())) {
      return value;
    }
  }
  return null;
}

/**
 * Extract a window of transcript context around a given timestamp or quote.
 * Returns ~5 utterances before and after the match point.
 */
function extractContext(transcript, timestamp, quote) {
  if (!transcript) return null;

  const lines = transcript.split("\n\n");
  let bestIdx = -1;

  // Strategy 1: Match by timestamp
  if (timestamp) {
    const targetMins = parseTimestamp(timestamp);
    if (targetMins !== null) {
      let bestDist = Infinity;
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^\[(\d+):(\d+)\]/);
        if (match) {
          const lineMins = parseInt(match[1]) + parseInt(match[2]) / 60;
          const dist = Math.abs(lineMins - targetMins);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
      }
    }
  }

  // Strategy 2: Fallback to searching for quote text in transcript
  if (bestIdx === -1 && quote) {
    // Take the first 40 chars of the quote and search for them
    const snippet = quote.substring(0, 40).toLowerCase();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(snippet)) {
        bestIdx = i;
        break;
      }
    }
    // If exact match fails, try with first 20 chars
    if (bestIdx === -1) {
      const shortSnippet = quote.substring(0, 20).toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(shortSnippet)) {
          bestIdx = i;
          break;
        }
      }
    }
  }

  if (bestIdx === -1) return null;

  // Grab 5 lines before and 5 after
  const start = Math.max(0, bestIdx - 5);
  const end = Math.min(lines.length, bestIdx + 6);
  return lines.slice(start, end).join("\n\n");
}

/**
 * Parse a timestamp string like "11:13" or "[11:13]" into fractional minutes.
 */
function parseTimestamp(ts) {
  const match = ts.match(/\[?(\d+):(\d+)\]?/);
  if (!match) return null;
  return parseInt(match[1]) + parseInt(match[2]) / 60;
}

module.exports = { extract };
