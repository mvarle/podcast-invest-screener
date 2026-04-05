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

# =============================================================
# PORTFOLIO INTELLIGENCE SYSTEM
# =============================================================

## Overview

Multi-agent investment analysis system built on Claude Code Agent Teams, inspired by TradingAgents (arxiv:2412.20138) and Caner et al.'s agentic screening framework (arxiv:2603.23300). Produces weekly ratings with transparent reasoning chains for a personal portfolio.

**Scope**: The portfolio includes holdings across multiple markets (OMX CPH, NYSE, NASDAQ, Euronext Paris, Borsa Italiana, Xetra). Nordic stocks are the PRIMARY focus, but ALL holdings receive the same screening and rating process. Podcast sentiment data (PodSignal) is currently excluded from analysis due to insufficient data — will be re-enabled once the pipeline has accumulated enough episodes.

**Supabase project**: `riwrrpvcysinedcxmqhv`
**Edge Function**: `refresh-prices` (JWT auth required)
**User ID**: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
**Prompt version**: `v1.0`

---

## Critical Rules (All Agents)

### No Look-Ahead Bias
- **NEVER** use information dated after the analysis date
- If uncertain whether a data point was available on the analysis date, exclude it and note the exclusion

### Source Date Verification
- When referencing news or events from web search, **ALWAYS verify the publication date**
- Events older than 30 days are BACKGROUND CONTEXT, not current catalysts
- If a search result does not include a clear date, note this uncertainty explicitly
- Be especially careful with recurring events (e.g., annual tariff announcements, quarterly earnings) — verify you are referencing the CURRENT year's instance, not a prior year

### Structured Output
- Each agent MUST output in the specified structured format below
- Free-form debate is reserved ONLY for the Bull vs Bear Researcher exchange

### Nordic Market Context
- Trading hours: 09:00-17:00 CET (Copenhagen, Stockholm, Helsinki), 09:00-16:20 CET (Oslo)
- Currency exposure matters: DKK, SEK, NOK, EUR, USD — always note currency when discussing valuation
- Nordic small/mid-caps have thinner analyst coverage — be explicit about data gaps
- Earnings seasons: February (Q4), April/May (Q1), August (Q2), October (Q3)
- **Minimum market cap for reliable analysis: 2B DKK** (data quality degrades below this)

### Rating Scale
- **Buy**: Strong conviction, significant upside expected (>15% 12-month)
- **Overweight**: Positive view, moderate upside expected (5-15%)
- **Hold**: Neutral, fairly valued or mixed signals
- **Underweight**: Negative view, limited upside or moderate downside risk
- **Sell**: Strong negative conviction, significant downside expected (>15%)

---

## Data Refresh Prerequisites

Before ANY analysis run (deep dive, weekly, or alert):
1. **Refresh price data**:
   ```bash
   curl -X POST "https://riwrrpvcysinedcxmqhv.supabase.co/functions/v1/refresh-prices" \
     -H "Authorization: Bearer <anon_or_service_role_key>" \
     -H "Content-Type: application/json" \
     -d '{"backfill_days": 7}'
   ```
   Or run locally: `npm run pipeline:prices`
2. **Verify freshness**: `SELECT ticker, MAX(trade_date) FROM price_data GROUP BY ticker` — latest date should be within 1 trading day of analysis_date
3. **If prices are stale, DO NOT proceed** — flag the issue and refresh first
4. `holdings.avg_cost` is the user's PURCHASE price, NOT the current price. Always use `price_data` for current market prices.
5. **After completing analysis**, save the full report as `reports/YYYY-MM-DD-weekly.md`

---

## Consensus Gate

Two-stage screening (Caner architecture): fundamental + sentiment agents screen independently, then consensus determines analysis depth.

- Both PASS → **DEEP ANALYSIS** (full bull/bear debate)
- One PASS + one WATCH → **STANDARD ANALYSIS** (analyst reports only, no debate)
- Both WATCH → **QUICK CHECK** (confirm last week's rating)
- Any FAIL → **FLAGGED** for review
- **OVERRIDE**: All holdings get minimum STANDARD regardless of screening

**Design rationale**: When two independent screening agents must agree, mild errors by either are filtered out. The Caner paper proves screened portfolio Sharpe ratio is preserved even with imperfect screening. Also: human sell-side analyst recommendations consistently DEGRADE AI performance — observe them as background context only, never as a primary signal. The number of stocks passing the gate varies weekly — never force a fixed number through.

---

## Workflow Sequence

```
STAGE 1 — SCREENING (parallel, no inter-agent communication)
  Fundamental Analyst + Sentiment Analyst screen ALL stocks → PASS/WATCH/FAIL each
  Portfolio Manager applies consensus gate (see rules above)

STAGE 2 — TIERED ANALYSIS
  DEEP ANALYSIS: Full technical report + Bull/Bear debate (2 rounds max) + PM synthesis
  STANDARD:      Abbreviated technical check + PM synthesis (MEDIUM confidence cap)
  QUICK CHECK:   Carry forward last week's rating with "No material change" note

STAGE 3 — PORTFOLIO CONSTRUCTION
  Concentration check (no single stock >10%, no sector >30%)
  Correlation flags, currency exposure, position sizing suggestions
  Write all results to Supabase incrementally (per-stock, per-stage)
  Use ON CONFLICT (user_id, analysis_date, ticker) DO UPDATE for idempotency
  Include prompt_version and run_id on all writes
```

---

## Agent Roles & Output Formats

### Portfolio Manager (Team Lead)
Orchestrates only — does NOT perform analysis. Reads holdings/watchlist from Supabase, assigns work, applies consensus gate, synthesizes final ratings, writes to database.

### Fundamental Analyst

Evaluates: revenue growth (3Y/YoY/QoQ), margins, balance sheet, valuation vs history and peers, insider transactions (90 days), dividends, upcoming catalysts, management quality.

**Output** (per stock):
```
TICKER: [ticker]
SCREENING_DECISION: [PASS/WATCH/FAIL]
SCREENING_RATIONALE: [1 sentence]
FUNDAMENTAL_SCORE: [1-10]
REVENUE_TREND: [accelerating/stable/decelerating]
MARGIN_TREND: [expanding/stable/contracting]
BALANCE_SHEET: [strong/adequate/weak]
VALUATION_VS_HISTORY: [cheap/fair/expensive]
VALUATION_VS_PEERS: [cheap/fair/expensive]
INSIDER_ACTIVITY: [net buying/neutral/net selling]
UPCOMING_CATALYSTS: [list with dates]
KEY_RISKS: [top 2-3]
SUMMARY: [2-3 sentences]
```

**PASS**: Material change since last analysis (earnings, guidance revision, insider cluster, valuation shift >10%, catalyst within 4 weeks). **WATCH**: No material change. **FAIL**: Deteriorating with no catalyst (watchlist only — holdings cannot FAIL).

### Sentiment & News Analyst

Evaluates: news flow (last 2 weeks — VERIFY publication dates), analyst sentiment (BACKGROUND CONTEXT ONLY — do NOT let it anchor your assessment), macro context.

**PodSignal podcast data**: EXCLUDED from analysis for now. The `pod_signal_view` contains only ~53 mentions from 9 episodes — insufficient data to be a reliable signal. Do NOT query or reference podcast sentiment in screening decisions. This will be re-enabled once the PodSignal pipeline has accumulated 6+ months of data across 50+ episodes.

**Output** (per stock):
```
TICKER: [ticker]
SCREENING_DECISION: [PASS/WATCH/FAIL]
SCREENING_RATIONALE: [1 sentence]
SENTIMENT_SCORE: [1-10]
NEWS_FLOW: [positive/neutral/negative]
NEWS_HIGHLIGHTS: [top 2-3 items with VERIFIED dates]
ANALYST_CONSENSUS: [trend] — NOTE: background only
MACRO_SENSITIVITY: [key exposure]
SENTIMENT_TRAJECTORY: [improving/stable/deteriorating]
SUMMARY: [2-3 sentences]
```

**PASS**: Material sentiment shift, significant news, trajectory change. **WATCH**: Stable. **FAIL**: Persistent negative, no improvement catalyst (watchlist only).

### Technical & Momentum Analyst

**Output** (per stock):
```
TICKER: [ticker]
TECHNICAL_SCORE: [1-10]
TREND: [strong uptrend/uptrend/sideways/downtrend/strong downtrend]
RSI_14: [value] — [overbought/neutral/oversold]
MACD_SIGNAL: [bullish/neutral/bearish]
VS_50D_SMA: [above/below X%]
VS_200D_SMA: [above/below X%]
RELATIVE_STRENGTH_VS_NORDIC40: [outperforming/inline/underperforming]
VOLUME_SIGNAL: [accumulation/normal/distribution]
KEY_LEVELS: [support at X, resistance at X]
SUMMARY: [2-3 sentences]
```

### Bull Researcher (DEEP ANALYSIS only)

Construct the strongest bull case. When receiving the Bear's thesis, respond SPECIFICALLY — engage with their points, don't just restate yours. Max 2 debate rounds.

```
TICKER: [ticker]
BULL_CONVICTION: [high/medium/low]
BULL_THESIS: [3-5 sentences]
KEY_CATALYSTS: [top 3 with timeframes]
BEAR_REBUTTAL: [specific response to each bear argument]
UPSIDE_TARGET: [% and reasoning]
```

### Bear Researcher (DEEP ANALYSIS only)

Construct the strongest bear case. When receiving the Bull's thesis, respond SPECIFICALLY — explain why the bull case is flawed. Max 2 debate rounds.

```
TICKER: [ticker]
BEAR_CONVICTION: [high/medium/low]
BEAR_THESIS: [3-5 sentences]
KEY_RISKS: [top 3 with probability]
BULL_REBUTTAL: [specific response to each bull argument]
DOWNSIDE_TARGET: [% and reasoning]
```

---

## Portfolio Manager Synthesis Formats

### Per-Stock Rating
```
TICKER: [ticker]
COMPANY: [name]
MARKET: [exchange]
CURRENCY: [DKK/SEK/NOK/EUR/USD]
CURRENT_PRICE: [from price_data]
RATING: [Buy/Overweight/Hold/Underweight/Sell]
RATING_CHANGE: [upgrade/downgrade/unchanged/NEW]
CONFIDENCE: [high/medium/low]
FUNDAMENTAL_SCORE: [1-10]
SENTIMENT_SCORE: [1-10]
TECHNICAL_SCORE: [1-10]
COMPOSITE_SCORE: [50% fundamental + 30% sentiment + 20% technical]
BULL_SUMMARY: [1 sentence]
BEAR_SUMMARY: [1 sentence]
DECISIVE_FACTOR: [what tipped the rating]
PORTFOLIO_ACTION: [maintain/add/trim/exit | initiate/monitor/remove]
POSITION_CONTEXT: [if held: weight, P&L, duration]
```

Composite weights (50/30/20) are initial priors — will be recalibrated from `report_history` data once sufficient observations accumulate.

### Portfolio-Level Assessment
```
CONSENSUS_GATE_STATS: [screened/deep/standard/quick]
PORTFOLIO_RISK_FLAGS: [concentration, sector, currency, correlation]
TOP_CONVICTION_BUYS: [top 3 from watchlist]
TOP_CONVICTION_SELLS: [any holdings rated Underweight/Sell]
RATING_CHANGES: [all changes vs last week]
KEY_EVENTS_NEXT_WEEK: [earnings, ex-div, macro]
OVERALL_MARKET_STANCE: [bullish/neutral/cautious]
```

Record `volatility_annualized` and `avg_daily_volume_30d` in `report_history` for conditional accuracy analysis.

---

## Database Reference

| Table | Purpose | Frequency |
|-------|---------|-----------|
| `holdings` | Portfolio positions | Manual |
| `watchlist` | Monitored stocks | Manual |
| `pod_signal_view` | Podcast sentiment (VIEW over `stock_mentions`) | Per episode |
| `price_data` | Daily closing prices | Daily/automated |
| `screening_results` | Consensus gate output | Weekly |
| `technical_reports` | Momentum & trend data | Weekly |
| `debate_records` | Bull/bear theses & rebuttals | Weekly (DEEP only) |
| `weekly_reports` | Final ratings | Weekly |
| `portfolio_assessments` | Portfolio-level analysis | Weekly |
| `report_history` | Immutable track record (append-only) | Weekly |
| `pipeline_runs` | Run tracking and recovery | Per run |

**Views**: `latest_ratings`, `accuracy_summary`, `consensus_gate_effectiveness`, `podsignal_effectiveness`

Run `SELECT public.update_accuracy()` weekly to backfill accuracy metrics from price data.

---

## Schema Notes
- No `profiles` table — extends existing `users` table
- No `pod_signal` table — uses `pod_signal_view` over `stock_mentions`
- `update_accuracy()` uses nearest-trading-day window (+/- 3 days), not exact date match
- Hold ratings: tolerance band +/-5% at 4W, +/-10% at 12W
- CHECK constraints on all scores (1-10), ratings, screening decisions
- `is_valid` flag on `report_history` for prompt regression handling

## Token Efficiency
- Split large stock lists into groups of ~30 per round
- Debate is the most expensive phase — limit to 2 rounds, DEEP ANALYSIS stocks only
- If approaching context limits, prioritize holdings over watchlist

## Future: API Migration
Each agent becomes an independent API call: Fundamental/Technical → Haiku, Sentiment → Sonnet, Bull/Bear → Opus, PM → Sonnet. Output format schemas carry over directly. Supabase stays as data layer.
