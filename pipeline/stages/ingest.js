/**
 * Stage 1: RSS Ingestion
 * Fetches RSS feed, inserts new episodes into Supabase.
 * Uses episode GUID for deduplication.
 */

const RSSParser = require("rss-parser");
const { supabase } = require("../supabase-client");

const MAX_EPISODES = 5; // Cap total episodes to control Deepgram/Claude costs

async function ingest() {
  // Get all active podcasts
  const { data: podcasts, error: podErr } = await supabase
    .from("podcasts")
    .select("*")
    .eq("is_active", true);

  if (podErr) throw new Error(`Failed to fetch podcasts: ${podErr.message}`);
  if (!podcasts?.length) {
    console.log("No active podcasts found.");
    return;
  }

  const parser = new RSSParser();

  for (const podcast of podcasts) {
    console.log(`Processing: ${podcast.name}`);
    console.log(`  RSS: ${podcast.rss_feed_url}`);

    let feed;
    try {
      feed = await parser.parseURL(podcast.rss_feed_url);
    } catch (err) {
      console.error(`  Error parsing RSS: ${err.message}`);
      continue;
    }

    console.log(`  Found ${feed.items.length} episodes in feed`);

    // Get existing GUIDs to avoid duplicates
    const { data: existing } = await supabase
      .from("episodes")
      .select("episode_guid")
      .eq("podcast_id", podcast.id);

    const existingGuids = new Set((existing || []).map((e) => e.episode_guid));
    const existingCount = existingGuids.size;

    if (existingCount >= MAX_EPISODES) {
      console.log(`  Already at episode cap (${existingCount}/${MAX_EPISODES}). Skipping.`);
      continue;
    }

    const newEpisodes = feed.items.filter(
      (item) => item.guid && !existingGuids.has(item.guid)
    );

    if (newEpisodes.length === 0) {
      console.log("  No new episodes.");
      continue;
    }

    const slotsAvailable = MAX_EPISODES - existingCount;
    const capped = newEpisodes.slice(0, slotsAvailable);
    console.log(`  ${newEpisodes.length} new episodes found, ingesting ${capped.length} (cap: ${MAX_EPISODES})`);

    // Insert new episodes (batch)
    const rows = capped.map((item) => ({
      podcast_id: podcast.id,
      title: item.title || "Untitled",
      release_date: item.pubDate || new Date().toISOString(),
      episode_guid: item.guid,
      audio_url: item.enclosure?.url || "",
      status: "pending_transcription",
    }));

    // Filter out episodes without audio URLs
    const validRows = rows.filter((r) => r.audio_url);
    if (validRows.length < rows.length) {
      console.log(
        `  Skipping ${rows.length - validRows.length} episodes without audio URLs`
      );
    }

    const { error: insertErr } = await supabase
      .from("episodes")
      .insert(validRows);

    if (insertErr) {
      console.error(`  Insert error: ${insertErr.message}`);
    } else {
      console.log(`  Inserted ${validRows.length} episodes`);
    }
  }
}

module.exports = { ingest };
