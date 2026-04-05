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
  speaker: string;
  sentiment: "bullish" | "bearish" | "hold";
  created_at: string;
};

type SpeakerSummary = {
  name: string;
  total: number;
  bullish: number;
  bearish: number;
  hold: number;
  latest: string;
};

async function getSpeakers(): Promise<SpeakerSummary[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("stock_mentions_public")
    .select("speaker, sentiment, created_at")
    .not("speaker", "is", null)
    .in("mention_type", ["investment_call"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching speakers:", error);
    return [];
  }

  const rows = (data as MentionRow[]) || [];
  const map = new Map<string, SpeakerSummary>();

  for (const row of rows) {
    const existing = map.get(row.speaker);
    if (existing) {
      existing.total++;
      existing[row.sentiment]++;
      if (row.created_at > existing.latest) existing.latest = row.created_at;
    } else {
      map.set(row.speaker, {
        name: row.speaker,
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

export default async function SpeakersPage() {
  const speakers = await getSpeakers();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Speakers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Podcast hosts and guests making stock calls.
        </p>
      </div>

      {speakers.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg mb-2">No speakers yet</p>
          <p className="text-sm">
            Speaker data will appear here once episodes are processed.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Speaker</TableHead>
              <TableHead className="text-center">Mentions</TableHead>
              <TableHead>Sentiment</TableHead>
              <TableHead>Latest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {speakers.map((speaker) => (
              <TableRow key={speaker.name}>
                <TableCell>
                  <Link
                    href={`/speaker/${encodeURIComponent(speaker.name)}`}
                    className="font-medium hover:underline"
                  >
                    {speaker.name}
                  </Link>
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {speaker.total}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {speaker.bullish > 0 && (
                      <SentimentBadge sentiment="bullish" />
                    )}
                    {speaker.bearish > 0 && (
                      <SentimentBadge sentiment="bearish" />
                    )}
                    {speaker.hold > 0 && <SentimentBadge sentiment="hold" />}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {timeAgo(speaker.latest)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
