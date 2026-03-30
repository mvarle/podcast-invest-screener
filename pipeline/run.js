/**
 * PodSignal Pipeline — Full ingestion + transcription + extraction
 *
 * Runs all three pipeline stages:
 *   1. RSS ingestion: fetch new episodes, insert into Supabase
 *   2. Transcription: send audio URLs to Deepgram, store transcripts
 *   3. Extraction: send transcripts to Claude, store stock mentions
 *
 * Usage:
 *   node pipeline/run.js              # Run full pipeline
 *   node pipeline/run.js --ingest     # Only RSS ingestion
 *   node pipeline/run.js --transcribe # Only transcription
 *   node pipeline/run.js --extract    # Only extraction
 */

require("dotenv").config();
const { ingest } = require("./stages/ingest");
const { transcribe } = require("./stages/transcribe");
const { extract } = require("./stages/extract");

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

  console.log("═══════════════════════════════════════════");
  console.log("  Pipeline complete");
  console.log("═══════════════════════════════════════════");
}

main().catch((err) => {
  console.error("Pipeline error:", err.message);
  process.exit(1);
});
