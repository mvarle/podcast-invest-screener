/**
 * Stage 3: Extraction
 * Picks up episodes with status 'transcription_complete',
 * sends transcript to Claude for structured stock mention extraction,
 * resolves tickers via lookup table, normalizes speakers, stores mentions.
 * Optionally runs a verification pass on investment_call mentions.
 */

const Anthropic = require("@anthropic-ai/sdk");
const { supabase } = require("../supabase-client");

const MAX_RETRIES = 5;

// ─── Tool schema ───────────────────────────────────────────

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
            company_name: {
              type: "string",
              description: "The company name as discussed in the podcast.",
            },
            ticker: {
              type: "string",
              description: "Stock ticker if confidently known (e.g., NOVO-B.CO, AAPL). Use null if unsure.",
            },
            sentiment: {
              type: "string",
              enum: ["bullish", "bearish", "hold"],
              description: "The speaker's net directional view on this stock. Only assign for investment_call and comparison types. Use 'hold' if the speaker explicitly recommends holding or if the net position is neutral.",
            },
            mention_type: {
              type: "string",
              enum: ["investment_call", "comparison", "passing_mention", "news_reference"],
            },
            confidence: {
              type: "number",
              description: "Extraction confidence (0.0-1.0). This reflects ONLY how clearly the transcript could be parsed at this point: transcription quality, speaker clarity, unambiguous company reference. It does NOT reflect how hedged the speaker was — that is conviction_strength. Lower this if the transcript has artifacts, the speaker is hard to identify, or the company reference is ambiguous.",
            },
            speaker: {
              type: "string",
              description: "Speaker name. Use known host/guest names when identifiable. Use 'Unknown Guest' for unidentifiable speakers. Never use 'Speaker N' labels.",
            },
            timestamp: {
              type: "string",
              description: "Approximate timestamp from the transcript (e.g., '12:30').",
            },
            quote: {
              type: "string",
              description: "2-4 sentence excerpt from the transcript (in original Danish) capturing the key opinion. Must be an ACTUAL contiguous passage from the transcript, not stitched from multiple segments.",
            },
            reasoning: {
              type: "string",
              description: "Brief analytical explanation in English of why this sentiment and conviction were assigned. Describe the speaker's argument and rationale. Do NOT translate or paraphrase the Danish quote.",
            },
            call_summary: {
              type: "string",
              description: "A single sentence of original financial analysis summarizing the speaker's position. Written as an independent observation, NOT a translation or paraphrase of the Danish quote. Example: 'Sees current valuation as attractive following the 40% pullback, expecting GLP-1 demand to drive a guidance raise.' This will be shown to end users as the primary description of the call.",
            },
            conviction_strength: {
              type: "string",
              enum: ["strong", "moderate", "tentative"],
            },
          },
          required: [
            "company_name", "sentiment", "mention_type", "confidence",
            "speaker", "quote", "reasoning", "call_summary", "conviction_strength",
          ],
        },
      },
      episode_summary: {
        type: "string",
        description: "Brief 2-3 sentence summary of the episode's main investment topics (in English).",
      },
    },
    required: ["stock_mentions", "episode_summary"],
  },
};

const VERIFICATION_TOOL = {
  name: "verify_mentions",
  description: "Verify extracted stock mentions for accuracy.",
  input_schema: {
    type: "object",
    properties: {
      verifications: {
        type: "array",
        items: {
          type: "object",
          properties: {
            mention_index: { type: "number", description: "Index of the mention being verified (0-based)." },
            action: { type: "string", enum: ["keep", "reclassify", "reject"] },
            new_mention_type: { type: "string", enum: ["investment_call", "comparison", "passing_mention", "news_reference"] },
            new_conviction_strength: { type: "string", enum: ["strong", "moderate", "tentative"] },
            new_sentiment: { type: "string", enum: ["bullish", "bearish", "hold"] },
            reason: { type: "string", description: "Why this action was taken." },
          },
          required: ["mention_index", "action", "reason"],
        },
      },
    },
    required: ["verifications"],
  },
};

// ─── System prompt ─────────────────────────────────────────

const SYSTEM_PROMPT = `You are a conservative financial analyst reviewing a Danish investment podcast transcript. Your priority is ACCURACY over COMPLETENESS. It is far better to miss a mention than to misattribute sentiment or fabricate a call that a speaker did not make.

MENTION TYPE CLASSIFICATION (apply this decision tree in order):
1. Does the speaker explicitly state they would buy, sell, or hold this stock, or recommend others do so?
   → "investment_call"
2. Does the speaker express a clear directional opinion (positive or negative) about the stock's prospects as the main subject of discussion?
   → "investment_call"
3. Is the stock mentioned to contrast with or compare to another stock being discussed?
   → "comparison"
4. Is the speaker reporting news, earnings, or events about the company WITHOUT adding personal investment interpretation?
   → "news_reference"
5. Is the company name mentioned in passing without substantive discussion?
   → "passing_mention" — only extract if there is clear sentiment attached, otherwise SKIP entirely.

CRITICAL DEFAULT: When in doubt between "investment_call" and "news_reference", ALWAYS choose "news_reference". It is better to under-classify than to attribute a call to someone who was merely reporting.

CONVICTION STRENGTH CRITERIA:
- "strong": The speaker uses first-person action language with NO hedging qualifiers. They provide specific reasoning (valuation, catalysts, thesis). They state their OWN view, not relaying someone else's opinion.
  Requires phrases like: "Jeg har købt", "Vi køber den", "Det er et klart køb", "Jeg anbefaler at købe", "I am buying", "We bought"
  CANNOT have: "måske" (maybe), "hvis" (if), "kunne" (could), "eventuelt" (possibly), "tror jeg" (I think) as the primary framing
- "moderate": The speaker expresses a directional lean but with some qualification. They may note risks alongside their view. Or they express a clear view without stating personal action intent.
  Examples: "Jeg tror den er interessant", "Der burde være potentiale", "Den er ret attraktiv her"
- "tentative": The speaker is musing or thinking aloud. They use hypothetical framing. They are responding to a direct question rather than volunteering an opinion. They discuss what "one could" do rather than what they will do.
  Examples: "Hvis man skulle...", "Man kunne overveje...", "Det er ikke utænkeligt at..."

RULE: When in doubt between two conviction levels, ALWAYS choose the lower one.

DANISH CULTURAL CALIBRATION: Danish professional communication is characteristically understated. The following Danish expressions indicate STRONGER conviction than their literal English translations suggest:
- "Ret interessant" (quite interesting) ≈ genuinely enthusiastic → at least "moderate"
- "Jeg er tæt på at købe" (I'm close to buying) ≈ strong purchase intent → "strong"
- "Den er god nok" (it's good enough) ≈ solid endorsement → "moderate"
- "Det kunne godt være interessant" (it could well be interesting) ≈ genuine interest → "moderate"
Conversely, do not over-calibrate. If someone genuinely hedges with "måske" or "eventuelt", that is tentative regardless of cultural norms.

CONFIDENCE vs CONVICTION — these are SEPARATE dimensions:
- confidence (0.0-1.0): How clearly could we parse the transcript? Is the company name unambiguous? Is the speaker clearly identified? Is the audio quality good at this point? This has NOTHING to do with how hedged the speaker was.
- conviction_strength: How strongly did the speaker express their view? This has NOTHING to do with transcription quality.
Example: A perfectly clear transcript of someone saying "Man kunne overveje Novo Nordisk" = confidence 0.95, conviction "tentative".

TRANSCRIPT QUALITY WARNING: This transcript was auto-generated from Danish audio. Common errors include:
- Company names may be garbled (e.g., "Envidia" = NVIDIA, "SMS" = ASML, "dåb" = Adobe, "microron" = Micron)
- Financial terms may appear as artifacts from keyword boosting: "bear" may be "bare" (just/only), "short" may be "kort" (brief), "long" may be "lang" (long)
- Speaker names may be garbled — match against the known hosts list rather than trusting the transcript spelling
RULE: Only consider a company name as a genuine mention if it appears in context where the company is actually being discussed. Ignore isolated occurrences that look like transcription artifacts.

SPEAKER IDENTIFICATION:
- A list of known hosts/guests is provided at the top of the transcript. Use it to match "Speaker N" labels to real names.
- Look for introductions near the start where hosts greet guests by name.
- For sponsor/ad segments, label as "Sponsor" and do NOT extract stock mentions.
- For unidentifiable speakers, use "Unknown Guest" rather than "Speaker N".

PANEL DISCUSSIONS:
- When multiple speakers express agreement about a stock, create ONE mention for the PRIMARY speaker who made the argument.
- Do NOT create separate investment_call entries for speakers who merely agree ("ja", "enig", "det tror jeg også").
- Only create a separate entry if a speaker adds SUBSTANTIAL new reasoning.

EDGE CASES:
- DEVIL'S ADVOCATE: If a speaker explicitly frames their position as playing devil's advocate ("djævelens advokat", "for at sige det modsatte", "bare for argumentets skyld"), do NOT classify as investment_call.
- HYPOTHETICALS: If a speaker uses conditional framing ("hvis jeg skulle købe", "forestil dig at"), maximum conviction is "tentative".
- BACKHANDED COMPLIMENTS: "Great company, terrible stock price" — classify sentiment based on the NET investment position, not the compliment.

QUOTE RULES:
- Quotes MUST be actual contiguous passages from the transcript in original Danish.
- Do NOT stitch together utterances from different timestamps into a single quote.
- If the relevant discussion spans multiple segments, pick the single most representative segment.

IGNORE: Sponsor/ad segments. Trivial passing mentions. Transcript artifacts that are not genuine stock discussions.`;

// ─── Verification prompt ───────────────────────────────────

const VERIFICATION_PROMPT = `You are reviewing stock mention extractions for quality control. Your default action should be KEEP. Only reject or reclassify when there is a clear error.

For each mention, you will see the original extraction and the surrounding transcript context. Determine:
1. KEEP: The extraction is reasonable — the speaker did discuss this stock with some opinion. This is the DEFAULT. Use this unless there is a clear reason not to.
2. RECLASSIFY: The extraction captured a real discussion but the mention_type, conviction_strength, or sentiment is clearly wrong. Only reclassify if you are confident the current classification misrepresents what was said.
3. REJECT: ONLY reject if one of these is true:
   - The company name is a transcript artifact (garbled audio, not a real stock discussion)
   - The mention is from a sponsor/advertisement segment
   - The speaker did not actually discuss this stock at all (complete misattribution)

DO NOT reject mentions just because:
- The speaker was hedging or tentative — that is what conviction_strength "tentative" is for
- The speaker was discussing their existing portfolio — portfolio discussions ARE investment calls
- The speaker was answering a listener question about a stock — that counts as an opinion
- The conviction is moderate rather than strong — moderate calls are still valid calls

DANISH CALIBRATION: Danish speakers understate. "Ret interessant" ≈ genuine enthusiasm. "Jeg er tæt på at købe" = strong purchase intent. "Den kunne godt være interessant" = genuine interest. Do NOT downgrade conviction for cultural understatement.`;

// ─── Main extraction function ──────────────────────────────

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
      let mentions = extraction.stock_mentions || [];
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`    Claude returned ${mentions.length} mentions in ${elapsed}s`);
      console.log(`    Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`);

      // ── Verification pass (investment_calls only) ──
      const investmentCalls = mentions.filter((m) => m.mention_type === "investment_call");
      if (investmentCalls.length > 0) {
        console.log(`    Running verification pass on ${investmentCalls.length} investment calls...`);
        mentions = await verifyMentions(client, mentions, transcript);
      }

      // ── Normalize speakers against known hosts ──
      mentions = mentions.map((m) => normalizeSpeaker(m, hosts));

      // ── Resolve tickers and build DB rows ──
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
          speaker_role: m._speaker_role || "guest",
          timestamp_in_transcript: m.timestamp || null,
          quote: m.quote,
          reasoning: m.reasoning,
          call_summary: m.call_summary || null,
          transcript_context: context,
        };
      });

      if (rows.length > 0) {
        const { error: insertErr } = await supabase
          .from("stock_mentions")
          .insert(rows);

        if (insertErr) throw new Error(`Mention insert failed: ${insertErr.message}`);
      }

      // ── Store extraction metadata ──
      const finalInvestmentCalls = rows.filter((r) => r.mention_type === "investment_call");
      const avgConfidence = rows.length > 0
        ? rows.reduce((sum, r) => sum + (r.confidence || 0), 0) / rows.length
        : 0;
      const convictionDist = {
        strong: rows.filter((r) => r.conviction_strength === "strong").length,
        moderate: rows.filter((r) => r.conviction_strength === "moderate").length,
        tentative: rows.filter((r) => r.conviction_strength === "tentative").length,
      };

      await supabase.from("extraction_metadata").upsert({
        episode_id: episode.id,
        mention_count: rows.length,
        investment_call_count: finalInvestmentCalls.length,
        avg_confidence: Math.round(avgConfidence * 100) / 100,
        conviction_distribution: convictionDist,
        extraction_model: "claude-sonnet-4-20250514",
        extraction_tokens_in: response.usage.input_tokens,
        extraction_tokens_out: response.usage.output_tokens,
        extraction_cost_usd: Math.round(
          ((response.usage.input_tokens * 0.003 + response.usage.output_tokens * 0.015) / 1000) * 10000
        ) / 10000,
      }, { onConflict: "episode_id" });

      // Update episode status
      await supabase
        .from("episodes")
        .update({ status: "analysis_complete" })
        .eq("id", episode.id);

      console.log(`    Stored: ${rows.length} mentions (${finalInvestmentCalls.length} investment calls)`);
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

// ─── Verification pass ─────────────────────────────────────

async function verifyMentions(client, mentions, transcript) {
  const investmentCallIndices = [];
  const verificationItems = [];

  mentions.forEach((m, i) => {
    if (m.mention_type === "investment_call") {
      investmentCallIndices.push(i);
      const context = extractContext(transcript, m.timestamp, m.quote);
      verificationItems.push({
        index: i,
        company: m.company_name,
        sentiment: m.sentiment,
        conviction: m.conviction_strength,
        confidence: m.confidence,
        speaker: m.speaker,
        reasoning: m.reasoning,
        transcript_context: context || "(no context found)",
      });
    }
  });

  if (verificationItems.length === 0) return mentions;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: VERIFICATION_PROMPT,
      tools: [VERIFICATION_TOOL],
      tool_choice: { type: "tool", name: "verify_mentions" },
      messages: [
        {
          role: "user",
          content: `Review these ${verificationItems.length} investment_call extractions:\n\n${JSON.stringify(verificationItems, null, 2)}`,
        },
      ],
    });

    const toolUse = response.content.find((c) => c.type === "tool_use");
    if (!toolUse) return mentions;

    const verifications = toolUse.input.verifications || [];
    let rejectCount = 0;
    let reclassifyCount = 0;

    // Apply verifications
    for (const v of verifications) {
      const originalIdx = v.mention_index;
      if (originalIdx < 0 || originalIdx >= mentions.length) continue;

      if (v.action === "reject") {
        mentions[originalIdx] = null; // Mark for removal
        rejectCount++;
      } else if (v.action === "reclassify") {
        if (v.new_mention_type) mentions[originalIdx].mention_type = v.new_mention_type;
        if (v.new_conviction_strength) mentions[originalIdx].conviction_strength = v.new_conviction_strength;
        if (v.new_sentiment) mentions[originalIdx].sentiment = v.new_sentiment;
        reclassifyCount++;
      }
    }

    // Remove rejected mentions
    mentions = mentions.filter((m) => m !== null);

    console.log(`    Verification: ${rejectCount} rejected, ${reclassifyCount} reclassified, ${investmentCallIndices.length - rejectCount - reclassifyCount} kept`);
    return mentions;
  } catch (err) {
    console.error(`    Verification pass failed (non-fatal): ${err.message}`);
    return mentions; // Continue with unverified mentions
  }
}

// ─── Speaker normalization ─────────────────────────────────

/**
 * Fuzzy-match a speaker name against the known hosts list.
 * Adds _speaker_role to the mention object.
 */
function normalizeSpeaker(mention, hosts) {
  if (!mention.speaker || !hosts || hosts.length === 0) {
    mention._speaker_role = "guest";
    return mention;
  }

  const speakerLower = mention.speaker.toLowerCase();

  // Exact match first
  for (const host of hosts) {
    if (host.name.toLowerCase() === speakerLower) {
      mention.speaker = host.name; // Use canonical name
      mention._speaker_role = host.role || "guest";
      return mention;
    }
  }

  // Fuzzy match: check if speaker name contains a host's last name or vice versa
  for (const host of hosts) {
    const hostParts = host.name.toLowerCase().split(/\s+/);
    const speakerParts = speakerLower.split(/\s+/);

    // Match on last name (most distinctive part)
    const hostLast = hostParts[hostParts.length - 1];
    const speakerLast = speakerParts[speakerParts.length - 1];

    // Check if last names are similar (Levenshtein distance <= 2)
    if (hostLast.length >= 4 && speakerLast.length >= 4 && levenshtein(hostLast, speakerLast) <= 2) {
      console.log(`    Speaker normalized: "${mention.speaker}" → "${host.name}"`);
      mention.speaker = host.name;
      mention._speaker_role = host.role || "guest";
      return mention;
    }

    // Check if first names match and last names are close
    if (hostParts.length >= 2 && speakerParts.length >= 2) {
      const hostFirst = hostParts[0];
      const speakerFirst = speakerParts[0];
      if (hostFirst === speakerFirst || levenshtein(hostFirst, speakerFirst) <= 1) {
        if (levenshtein(hostLast, speakerLast) <= 3) {
          console.log(`    Speaker normalized: "${mention.speaker}" → "${host.name}"`);
          mention.speaker = host.name;
          mention._speaker_role = host.role || "guest";
          return mention;
        }
      }
    }
  }

  // No match — mark as guest
  mention._speaker_role = "guest";
  return mention;
}

/**
 * Simple Levenshtein distance for short strings.
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ─── Ticker resolution ─────────────────────────────────────

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

// ─── Transcript context extraction ─────────────────────────

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
    const snippet = quote.substring(0, 40).toLowerCase();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(snippet)) {
        bestIdx = i;
        break;
      }
    }
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
