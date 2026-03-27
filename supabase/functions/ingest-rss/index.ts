import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseFeed } from "https://esm.sh/htmlparser2@9.1.0/lib/feeds";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface FeedItem {
  id?: string;
  title?: string;
  link?: string;
  pubDate?: string;
  enclosures?: Array<{ url: string; type?: string }>;
}

Deno.serve(async (req: Request) => {
  try {
    // Fetch all active podcasts
    const { data: podcasts, error: podcastError } = await supabase
      .from("podcasts")
      .select("*")
      .eq("is_active", true);

    if (podcastError) throw podcastError;
    if (!podcasts || podcasts.length === 0) {
      return new Response(JSON.stringify({ message: "No active podcasts found" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const podcast of podcasts) {
      try {
        // Fetch RSS feed
        const feedResponse = await fetch(podcast.rss_feed_url);
        const feedXml = await feedResponse.text();
        const feed = parseFeed(feedXml);

        if (!feed || !feed.items) {
          results.push({ podcast: podcast.name, status: "no items in feed" });
          continue;
        }

        // Get existing episode GUIDs for this podcast
        const { data: existingEpisodes } = await supabase
          .from("episodes")
          .select("episode_guid")
          .eq("podcast_id", podcast.id);

        const existingGuids = new Set(
          (existingEpisodes || []).map((e: { episode_guid: string }) => e.episode_guid)
        );

        let newCount = 0;

        for (const item of feed.items as FeedItem[]) {
          const guid = item.id || item.link || item.title;
          if (!guid || existingGuids.has(guid)) continue;

          // Find audio URL from enclosures
          const audioEnclosure = item.enclosures?.find(
            (e) => e.type?.startsWith("audio/") || e.url?.match(/\.(mp3|m4a|wav|ogg)/)
          );
          const audioUrl = audioEnclosure?.url || item.link;

          if (!audioUrl) continue;

          // Insert new episode
          const { error: insertError } = await supabase.from("episodes").insert({
            podcast_id: podcast.id,
            title: item.title || "Untitled Episode",
            release_date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
            episode_guid: guid,
            audio_url: audioUrl,
            status: "pending_transcription",
          });

          if (insertError) {
            console.error(`Error inserting episode: ${insertError.message}`);
          } else {
            newCount++;
          }
        }

        results.push({ podcast: podcast.name, newEpisodes: newCount });
      } catch (feedError) {
        console.error(`Error processing podcast ${podcast.name}:`, feedError);
        results.push({ podcast: podcast.name, error: String(feedError) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("RSS ingestion error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
