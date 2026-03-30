import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { SentimentBadge } from "@/components/sentiment-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const revalidate = 300;

type MentionRow = {
  ticker: string | null;
  company_name: string;
  exchange: string | null;
  sentiment: "bullish" | "bearish" | "hold";
  created_at: string;
};

type StockSummary = {
  ticker: string | null;
  company_name: string;
  exchange: string | null;
  total: number;
  bullish: number;
  bearish: number;
  hold: number;
  latest: string;
};

async function getStocks(): Promise<StockSummary[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("stock_mentions_public")
    .select("ticker, company_name, exchange, sentiment, created_at")
    .in("mention_type", ["investment_call"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching stocks:", error);
    return [];
  }

  const rows = (data as MentionRow[]) || [];
  const map = new Map<string, StockSummary>();

  for (const row of rows) {
    const key = row.ticker || row.company_name;
    const existing = map.get(key);
    if (existing) {
      existing.total++;
      existing[row.sentiment]++;
      if (row.created_at > existing.latest) existing.latest = row.created_at;
    } else {
      map.set(key, {
        ticker: row.ticker,
        company_name: row.company_name,
        exchange: row.exchange,
        total: 1,
        bullish: row.sentiment === "bullish" ? 1 : 0,
        bearish: row.sentiment === "bearish" ? 1 : 0,
        hold: row.sentiment === "hold" ? 1 : 0,
        latest: row.created_at,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays > 30)
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  if (diffDays > 0) return `${diffDays}d ago`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours > 0) return `${diffHours}h ago`;
  return "today";
}

export default async function StocksPage() {
  const stocks = await getStocks();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Stocks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All stocks mentioned as investment calls across tracked podcasts.
        </p>
      </div>

      {stocks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg mb-2">No stock mentions yet</p>
          <p className="text-sm">
            Stock mentions will appear here once episodes are processed.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticker</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Exchange</TableHead>
              <TableHead className="text-center">Mentions</TableHead>
              <TableHead>Sentiment</TableHead>
              <TableHead>Latest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stocks.map((stock) => {
              const key = stock.ticker || stock.company_name;
              return (
                <TableRow key={key}>
                  <TableCell>
                    <Link
                      href={`/stock/${encodeURIComponent(key)}`}
                      className="font-mono font-bold hover:underline"
                    >
                      {stock.ticker || "-"}
                    </Link>
                  </TableCell>
                  <TableCell>{stock.company_name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {stock.exchange || "-"}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {stock.total}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {stock.bullish > 0 && (
                        <SentimentBadge sentiment="bullish" />
                      )}
                      {stock.bearish > 0 && (
                        <SentimentBadge sentiment="bearish" />
                      )}
                      {stock.hold > 0 && <SentimentBadge sentiment="hold" />}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {timeAgo(stock.latest)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
