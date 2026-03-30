import { supabase } from "@/lib/supabase";
import { FeedContent } from "@/components/feed-content";
import type { MentionWithEpisode } from "@/types/database";

export const revalidate = 300; // ISR: revalidate every 5 minutes

async function getMentions(): Promise<MentionWithEpisode[]> {
  if (!supabase) return [];

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
    .in("mention_type", ["investment_call"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("Error fetching mentions:", error);
    return [];
  }

  return (data as unknown as MentionWithEpisode[]) || [];
}

export default async function FeedPage() {
  const mentions = await getMentions();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Recent Calls</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Stock mentions from tracked investment podcasts, sorted by date.
        </p>
      </div>

      {mentions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg mb-2">No stock mentions yet</p>
          <p className="text-sm">
            Stock mentions from tracked podcasts will appear here once episodes
            are processed.
          </p>
        </div>
      ) : (
        <FeedContent mentions={mentions} />
      )}
    </div>
  );
}
