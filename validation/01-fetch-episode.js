/**
 * Phase 0, Step 1: Fetch the latest episode from Millionærklubben RSS feed
 * Outputs: episode metadata + audio URL to validation/output/episode.json
 */

const RSSParser = require("rss-parser");
const fs = require("fs");
const path = require("path");

const RSS_FEED_URL =
  "https://www.omnycontent.com/d/playlist/1283f5f4-2508-4981-a99f-acb500e64dcf/27dfeb66-f61a-4fcc-aa6d-ad0800b05139/dc61232c-7e07-438e-981a-ad0800b05142/podcast.rss";

const OUTPUT_DIR = path.join(__dirname, "output");

async function fetchLatestEpisode() {
  console.log("Fetching RSS feed from Millionærklubben...\n");

  const parser = new RSSParser();
  const feed = await parser.parseURL(RSS_FEED_URL);

  console.log(`Podcast: ${feed.title}`);
  console.log(`Total episodes in feed: ${feed.items.length}\n`);

  // Show the 5 most recent episodes so user can pick
  console.log("5 most recent episodes:");
  console.log("─".repeat(70));
  feed.items.slice(0, 5).forEach((item, i) => {
    const date = new Date(item.pubDate).toISOString().split("T")[0];
    const duration = item.itunes?.duration || "unknown";
    console.log(`  [${i}] ${item.title}`);
    console.log(`      Date: ${date} | Duration: ${duration}`);
    console.log(`      Audio: ${item.enclosure?.url?.substring(0, 80)}...`);
    console.log();
  });

  // Pick the first episode that's likely a full episode (not a short "Eksklusiv" segment)
  // Prefer episodes with duration > 30 minutes
  const episode = feed.items[0]; // Default to latest

  const episodeData = {
    title: episode.title,
    pubDate: episode.pubDate,
    guid: episode.guid,
    audioUrl: episode.enclosure?.url,
    duration: episode.itunes?.duration || "unknown",
    description: episode.contentSnippet?.substring(0, 500) || "",
  };

  const outputPath = path.join(OUTPUT_DIR, "episode.json");
  fs.writeFileSync(outputPath, JSON.stringify(episodeData, null, 2));

  console.log("─".repeat(70));
  console.log(`\nSelected episode: "${episodeData.title}"`);
  console.log(`Audio URL: ${episodeData.audioUrl}`);
  console.log(`\nSaved to: ${outputPath}`);
  console.log(
    "\nNext step: Run 02-transcribe.js to send this to Deepgram for transcription."
  );
}

fetchLatestEpisode().catch((err) => {
  console.error("Error fetching RSS feed:", err.message);
  process.exit(1);
});
