import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const ALPHA_VANTAGE_KEY = Deno.env.get("ALPHA_VANTAGE_API_KEY")!;

interface SnapshotConfig {
  type: string;
  days: number;
}

const SNAPSHOT_MILESTONES: SnapshotConfig[] = [
  { type: "1d", days: 1 },
  { type: "1w", days: 7 },
  { type: "1m", days: 30 },
  { type: "3m", days: 90 },
  { type: "6m", days: 180 },
  { type: "1y", days: 365 },
];

async function fetchStockPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${ALPHA_VANTAGE_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    const price = parseFloat(data["Global Quote"]?.["05. price"]);
    return isNaN(price) ? null : price;
  } catch (error) {
    console.error(`Error fetching price for ${ticker}:`, error);
    return null;
  }
}

function daysBetween(date1: Date, date2: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((date2.getTime() - date1.getTime()) / msPerDay);
}

Deno.serve(async (req: Request) => {
  try {
    const today = new Date();
    const results = { baselinePricesSet: 0, snapshotsCreated: 0, errors: 0 };

    // 1. Set baseline prices for mentions that don't have one yet
    const { data: mentionsNeedingBaseline, error: baselineError } = await supabase
      .from("stock_mentions")
      .select("id, ticker, created_at")
      .is("baseline_price", null)
      .limit(20); // Rate limit: Alpha Vantage free tier = 25 calls/day

    if (baselineError) throw baselineError;

    for (const mention of mentionsNeedingBaseline || []) {
      const price = await fetchStockPrice(mention.ticker);
      if (price !== null) {
        await supabase
          .from("stock_mentions")
          .update({
            baseline_price: price,
            baseline_price_date: today.toISOString().split("T")[0],
          })
          .eq("id", mention.id);
        results.baselinePricesSet++;
      }
      // Small delay to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    // 2. Check for snapshot milestones on existing mentions
    const { data: mentionsWithBaseline, error: mentionsError } = await supabase
      .from("stock_mentions")
      .select("id, ticker, sentiment, baseline_price, baseline_price_date, created_at")
      .not("baseline_price", "is", null)
      .limit(50);

    if (mentionsError) throw mentionsError;

    for (const mention of mentionsWithBaseline || []) {
      const mentionDate = new Date(mention.created_at);
      const daysSinceMention = daysBetween(mentionDate, today);

      for (const milestone of SNAPSHOT_MILESTONES) {
        // Check if we're at or past the milestone
        if (daysSinceMention < milestone.days) continue;

        // Check if snapshot already exists
        const { data: existing } = await supabase
          .from("performance_snapshots")
          .select("id")
          .eq("mention_id", mention.id)
          .eq("snapshot_type", milestone.type)
          .limit(1);

        if (existing && existing.length > 0) continue;

        // Fetch current price
        const currentPrice = await fetchStockPrice(mention.ticker);
        if (currentPrice === null) continue;

        const priceChangePercent =
          ((currentPrice - mention.baseline_price) / mention.baseline_price) * 100;

        // Determine if prediction was correct
        let predictionCorrect: boolean | null = null;
        if (mention.sentiment === "bullish") {
          predictionCorrect = priceChangePercent > 0;
        } else if (mention.sentiment === "bearish") {
          predictionCorrect = priceChangePercent < 0;
        }
        // "hold" predictions are not scored

        const { error: insertError } = await supabase
          .from("performance_snapshots")
          .insert({
            mention_id: mention.id,
            snapshot_type: milestone.type,
            snapshot_date: today.toISOString().split("T")[0],
            closing_price: currentPrice,
            price_change_percent: Math.round(priceChangePercent * 100) / 100,
            prediction_correct: predictionCorrect,
          });

        if (insertError) {
          console.error(`Error inserting snapshot:`, insertError.message);
          results.errors++;
        } else {
          results.snapshotsCreated++;
        }

        // Rate limit
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    return new Response(JSON.stringify({ message: "Performance tracking complete", results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Performance tracking error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
