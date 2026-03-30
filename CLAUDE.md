# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PodSignal is a Danish investment podcast screener. It ingests podcast RSS feeds, transcribes audio via Deepgram, extracts stock mentions using Claude (tool_use), and displays them in a Next.js frontend. The primary podcast tracked is Millionærklubben (Danish).

## Repository Structure

- **`pipeline/`** — Node.js (CommonJS) data pipeline with three stages:
  1. `ingest` — Fetches RSS feeds, deduplicates via episode GUID, inserts into Supabase
  2. `transcribe` — Sends audio URLs to Deepgram (Danish, nova-2 model with diarization), stores transcripts
  3. `extract` — Sends transcripts to Claude via tool_use (`record_stock_mentions`), resolves tickers against `stock_tickers` lookup table, stores structured mentions
- **`frontend/`** — Next.js 16 app (App Router, React 19, TypeScript, Tailwind v4, shadcn/ui base-nova style)
- **`supabase/migrations/`** — SQL schema (PostgreSQL with RLS)
- **`validation/`** — Standalone scripts for testing individual pipeline stages

## Commands

### Pipeline (from repo root)
```bash
npm run pipeline              # Run full pipeline (ingest → transcribe → extract)
npm run pipeline:ingest       # RSS ingestion only
npm run pipeline:transcribe   # Transcription only
npm run pipeline:extract      # Extraction only
```

### Validation scripts (from repo root)
```bash
npm run validate:fetch        # Test RSS fetch
npm run validate:transcribe   # Test Deepgram transcription
npm run validate:extract      # Test Claude extraction
```

### Frontend (from `frontend/`)
```bash
npm run dev     # Next.js dev server
npm run build   # Production build
npm run lint    # ESLint
```

## Environment Variables

- **Root `.env`**: `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **`frontend/.env.local`**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The pipeline uses the service role key (bypasses RLS); the frontend uses the anon key (subject to RLS policies).

## Architecture Notes

- **Pipeline uses CommonJS** (`require`/`module.exports`), not ES modules. The root `package.json` sets `"type": "commonjs"`.
- **Extraction uses Claude tool_use** with forced tool choice (`tool_choice: { type: "tool", name: "record_stock_mentions" }`). The tool schema defines the structured output format for stock mentions.
- **Ticker resolution** maps company names from Claude's output to the `stock_tickers` table via case-insensitive matching on `common_names` arrays.
- **Episode status flow**: `pending_transcription` → `transcription_complete` → `analysis_complete` (or `error`/`failed` after 5 retries with exponential backoff).
- **Frontend data fetching** is server-side (React Server Components with ISR, 5-minute revalidation). The Supabase client is nullable — pages gracefully handle missing env vars.
- **Database types** are manually defined in `frontend/src/types/database.ts` (not auto-generated).
- **Transcripts are stored in a separate table** from episodes to avoid row bloat. Quotes in `stock_mentions` are kept in original Danish; reasoning is in English.
- **Next.js 16**: The frontend AGENTS.md warns that APIs may differ from training data. Check `node_modules/next/dist/docs/` before using unfamiliar Next.js APIs.
