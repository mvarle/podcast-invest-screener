import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { MentionCard } from "@/components/mention-card";
import { SentimentBadge } from "@/components/sentiment-badge";
import type { MentionWithEpisode } from "@/types/database";

export const revalidate = 300;

async function getMentionsForSpeaker(
  name: string
): Promise<MentionWithEpisode[]> {
  if (!supabase) return [];

  const decoded = decodeURIComponent(name);

  const { data, error } = await supabase
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
    .eq("speaker", decoded)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching speaker mentions:", error);
    return [];
  }

  return (data as unknown as MentionWithEpisode[]) || [];
}

export default async function SpeakerPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const mentions = await getMentionsForSpeaker(name);

  if (mentions.length === 0) {
    notFound();
  }

  const decoded = decodeURIComponent(name);
  const bullish = mentions.filter((m) => m.sentiment === "bullish").length;
  const bearish = mentions.filter((m) => m.sentiment === "bearish").length;
  const hold = mentions.filter((m) => m.sentiment === "hold").length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{decoded}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Stock calls from this speaker.
        </p>
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
