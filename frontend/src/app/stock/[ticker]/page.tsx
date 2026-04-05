import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { MentionCard } from "@/components/mention-card";
import { SentimentBadge } from "@/components/sentiment-badge";
import type { MentionWithEpisode } from "@/types/database";

export const revalidate = 300;

type StockInfo = {
  company_name: string;
  ticker_primary: string | null;
  exchange: string | null;
  sector: string | null;
  currency: string;
};

async function getMentionsForStock(
  ticker: string
): Promise<{ mentions: MentionWithEpisode[]; stockInfo: StockInfo | null }> {
  if (!supabase) return { mentions: [], stockInfo: null };

  const decoded = decodeURIComponent(ticker);

  const [mentionsResult, stockInfoResult] = await Promise.all([
    supabase
      .from("stock_mentions_public")
      .select(
        `
        *,
        episodes!inner (
          title,
          release_date,
          podcast_id,
          audio_url,
          podcasts!inner (
            name
          )
        )
      `
      )
      .or(`ticker.eq.${decoded},company_name.eq.${decoded}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("stock_tickers")
      .select("company_name, ticker_primary, exchange, sector, currency")
      .or(
        `ticker_primary.eq.${decoded},ticker_copenhagen.eq.${decoded},ticker_nyse.eq.${decoded}`
      )
      .limit(1)
      .maybeSingle(),
  ]);

  if (mentionsResult.error) {
    console.error("Error fetching stock mentions:", mentionsResult.error);
    return { mentions: [], stockInfo: null };
  }

  return {
    mentions:
      (mentionsResult.data as unknown as MentionWithEpisode[]) || [],
    stockInfo: (stockInfoResult.data as unknown as StockInfo) || null,
  };
}

export default async function StockPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const { mentions, stockInfo } = await getMentionsForStock(ticker);

  if (mentions.length === 0) {
    notFound();
  }

  const decoded = decodeURIComponent(ticker);
  const displayName =
    stockInfo?.company_name || mentions[0]?.company_name || decoded;
  const displayTicker = mentions[0]?.ticker || decoded;

  const bullish = mentions.filter((m) => m.sentiment === "bullish").length;
  const bearish = mentions.filter((m) => m.sentiment === "bearish").length;
  const hold = mentions.filter((m) => m.sentiment === "hold").length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold font-mono tracking-tight">
            {displayTicker}
          </h1>
          {displayTicker !== displayName && (
            <span className="text-lg text-muted-foreground">{displayName}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {stockInfo?.exchange && <span>{stockInfo.exchange}</span>}
          {stockInfo?.sector && (
            <>
              <span>&middot;</span>
              <span>{stockInfo.sector}</span>
            </>
          )}
          {stockInfo?.currency && (
            <>
              <span>&middot;</span>
              <span>{stockInfo.currency}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6 p-3 rounded-lg border bg-card">
        <span className="text-sm font-medium">
          {mentions.length} mention{mentions.length !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {bullish > 0 && <SentimentBadge sentiment="bullish" />}
          {bearish > 0 && <SentimentBadge sentiment="bearish" />}
          {hold > 0 && <SentimentBadge sentiment="hold" />}
        </div>
      </div>

      <div className="space-y-3">
        {mentions.map((mention) => (
          <MentionCard key={mention.id} mention={mention} />
        ))}
      </div>
    </div>
  );
}
