import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const EXTRACTION_PROMPT = `You are an expert financial analyst. Analyze the following podcast transcript and extract all stock mentions with sentiment analysis.

The transcript may be in Danish — handle this appropriately. Focus on extracting actionable investment opinions, not casual passing references.

For each stock mention, return a JSON object with these fields:
- ticker: The stock ticker symbol (e.g., "AAPL", "NOVO-B.CO" for Danish stocks)
- company_name: Full company name
- sentiment: One of "bullish", "bearish", or "hold"
- speaker: The speaker name or identifier (e.g., "Speaker 0") if available
- timestamp_in_transcript: Approximate position in transcript (e.g., "early", "mid", "late")
- quote: A 2-4 sentence excerpt from the transcript containing the key opinion
- reasoning: Brief explanation of why this sentiment was assigned

Rules:
1. Only include stocks where a clear opinion or recommendation is expressed
2. If multiple speakers discuss the same stock with different views, create separate entries
3. Same speaker mentioning the same stock multiple times with the same sentiment = one entry (use the strongest quote)
4. Include both well-known international stocks and Nordic/Danish stocks
5. For Danish stocks, use the Copenhagen exchange ticker format (e.g., "NOVO-B.CO", "MAERSK-B.CO")

Return ONLY a JSON array. No other text. If no stock mentions found, return an empty array [].`;

Deno.serve(async (req: Request) => {
  try {
    // Get episodes with completed transcription
    const { data: episodes, error: fetchError } = await supabase
      .from("episodes")
      .select("*")
      .eq("status", "transcription_complete")
      .order("created_at", { ascending: true })
      .limit(1);

    if (fetchError) throw fetchError;
    if (!episodes || episodes.length === 0) {
      return new Response(JSON.stringify({ message: "No episodes pending analysis" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const episode = episodes[0];
    console.log(`Analyzing episode: ${episode.title}`);

    try {
      // Send transcript to Claude for analysis
      const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `${EXTRACTION_PROMPT}\n\nTRANSCRIPT:\n${episode.transcript}`,
            },
          ],
        }),
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
      }

      const claudeResult = await claudeResponse.json();
      const responseText = claudeResult.content?.[0]?.text || "[]";

      // Parse the JSON response
      let mentions;
      try {
        // Extract JSON array from response (handle potential markdown code blocks)
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        mentions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch (parseError) {
        console.error("Failed to parse Claude response:", responseText);
        throw new Error(`Failed to parse analysis response: ${parseError}`);
      }

      // Insert stock mentions
      let insertedCount = 0;
      for (const mention of mentions) {
        const { error: insertError } = await supabase.from("stock_mentions").insert({
          episode_id: episode.id,
          ticker: mention.ticker,
          company_name: mention.company_name,
          sentiment: mention.sentiment,
          speaker: mention.speaker || null,
          timestamp_in_transcript: mention.timestamp_in_transcript || null,
          quote: mention.quote,
          reasoning: mention.reasoning || null,
        });

        if (insertError) {
          console.error(`Error inserting mention for ${mention.ticker}:`, insertError.message);
        } else {
          insertedCount++;
        }
      }

      // Update episode status
      const { error: updateError } = await supabase
        .from("episodes")
        .update({ status: "analysis_complete" })
        .eq("id", episode.id);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({
          message: "Analysis complete",
          episodeId: episode.id,
          title: episode.title,
          mentionsFound: mentions.length,
          mentionsInserted: insertedCount,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (analysisError) {
      await supabase
        .from("episodes")
        .update({
          status: "error",
          error_message: String(analysisError),
        })
        .eq("id", episode.id);

      throw analysisError;
    }
  } catch (error) {
    console.error("Analysis error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
