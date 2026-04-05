/**
 * PodSignal Pipeline — Full ingestion + transcription + extraction
 *
 * Runs all three pipeline stages:
 *   1. RSS ingestion: fetch new episodes, insert into Supabase
 *   2. Transcription: send audio URLs to Deepgram, store transcripts
 *   3. Extraction: send transcripts to Claude, store stock mentions
 *
 * Usage:
 *   node pipeline/run.js              # Run full pipeline (ingest+transcribe+extract)
 *   node pipeline/run.js --ingest     # Only RSS ingestion
 *   node pipeline/run.js --transcribe # Only transcription
 *   node pipeline/run.js --extract    # Only extraction
 *   node pipeline/run.js --fetch-prices             # Fetch 30 days of prices
 *   node pipeline/run.js --fetch-prices --backfill 365  # Backfill 1 year
 */

require("dotenv").config();
const { ingest } = require("./stages/ingest");
const { transcribe } = require("./stages/transcribe");
const { extract } = require("./stages/extract");
const { fetchPrices } = require("./stages/fetch-prices");

const args = process.argv.slice(2);
const runAll = args.length === 0;

async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  PodSignal Pipeline");
  console.log("═══════════════════════════════════════════\n");

  if (runAll || args.includes("--ingest")) {
    console.log("── Stage 1: RSS Ingestion ──\n");
    await ingest();
    console.log();
  }

  if (runAll || args.includes("--transcribe")) {
    console.log("── Stage 2: Transcription ──\n");
    await transcribe();
    console.log();
  }

  if (runAll || args.includes("--extract")) {
    console.log("── Stage 3: Extraction ──\n");
    await extract();
    console.log();
  }

  if (args.includes("--fetch-prices")) {
    console.log("── Price Data Fetch ──\n");
    const backfillIdx = args.indexOf("--backfill");
    const backfillDays =
      backfillIdx !== -1 ? parseInt(args[backfillIdx + 1], 10) : undefined;
    await fetchPrices(backfillDays);
    console.log();
  }

  console.log("═══════════════════════════════════════════");
  console.log("  Pipeline complete");
  console.log("═══════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Pipeline error:", err.message);
  process.exit(1);
});
