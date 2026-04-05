# Weekly Analysis — Agent Teams Spawn Prompt

## How to Use

Copy-paste the prompt below into Claude Code with Agent Teams enabled to run the weekly analysis. Adjust the date and any special instructions as needed.

---

## Spawn Prompt

```
Today is [INSERT DATE]. Run the weekly Nordic Portfolio Intelligence analysis.

**STEP 0 — REFRESH PRICE DATA (MANDATORY)**
Before ANY analysis, refresh market prices by running this command:
curl -X POST "https://riwrrpvcysinedcxmqhv.supabase.co/functions/v1/refresh-prices" -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" -d '{"backfill_days": 7}'
Then verify freshness: SELECT ticker, MAX(trade_date) FROM price_data GROUP BY ticker
The latest trade_date must be within 1 trading day of today. If stale, DO NOT proceed.
Note: holdings.avg_cost is the PURCHASE price, NOT the current price. Always use price_data for current market prices.

Read the portfolio holdings and watchlist from the Supabase database (tables: `holdings` and `watchlist`).
Also read the `pod_signal_view` for recent podcast sentiment data and query `latest_ratings` view for last week's ratings.

Spawn 5 teammates for this analysis:

This analysis follows a TWO-STAGE architecture (Caner et al. consensus screening):

STAGE 1 — CONSENSUS SCREENING
Spawn these teammates FIRST and let them work independently with NO communication:

1. **fundamental-analyst**: You are a Nordic equity fundamental analyst AND screener. For every stock in both the Holdings and Watchlist tabs, produce a structured fundamental report following the CLAUDE.md format. CRITICALLY: for each stock you must also output a SCREENING_DECISION (PASS/WATCH/FAIL) indicating whether this stock has material fundamental changes that warrant deep analysis this week. PASS means something has changed (earnings, guidance, insider activity, valuation shift >10%). WATCH means stable, no material change. FAIL means deteriorating with no catalyst (watchlist only — holdings cannot FAIL). Use web search for latest data — but NEVER use data dated after today.

2. **sentiment-news-analyst**: You are a Nordic market sentiment and news analyst AND screener. For every stock in both Holdings and Watchlist tabs, produce a structured sentiment report following the CLAUDE.md format. Check the PodSignal tab first for podcast sentiment data. CRITICALLY: for each stock you must also output a SCREENING_DECISION (PASS/WATCH/FAIL) indicating whether sentiment/news warrants deep analysis. PASS means material sentiment shift, significant news, or trajectory change. WATCH means stable. FAIL means persistent negative with no improvement catalyst (watchlist only). IMPORTANT: Note external analyst consensus as background context only. Per Caner et al., human analyst recommendations degrade AI performance — do NOT let analyst consensus anchor your own assessment.

After both screening agents complete, I (Portfolio Manager) will apply the CONSENSUS GATE:
- Both PASS → DEEP ANALYSIS (full bull/bear debate)
- One PASS + one WATCH → STANDARD ANALYSIS (analyst reports only, no debate)  
- Both WATCH → QUICK CHECK (confirm last week's rating)
- Any FAIL → flag for review
- OVERRIDE: All holdings get minimum STANDARD ANALYSIS regardless of screening

STAGE 2 — TIERED ANALYSIS
Then spawn these teammates for stocks that passed or need standard analysis:

3. **technical-analyst**: You are a technical and momentum analyst for Nordic equities. Produce full technical reports ONLY for stocks in the DEEP ANALYSIS pool. For STANDARD ANALYSIS stocks, produce an abbreviated momentum check (trend + RSI + relative strength only). Skip QUICK CHECK stocks entirely. Follow the CLAUDE.md format.

4. **bull-researcher**: You are a dedicated bull researcher. WAIT until all analyst reports are complete. You ONLY analyze stocks in the DEEP ANALYSIS pool. For each, construct the strongest possible bull case — you are an advocate for the long side. Follow the CLAUDE.md debate protocol: write your initial bull thesis first, then when you receive the bear-researcher's arguments, write specific rebuttals. Do not be wishy-washy.

5. **bear-researcher**: You are a dedicated bear researcher and skeptic. WAIT until all analyst reports are complete. You ONLY analyze stocks in the DEEP ANALYSIS pool. For each, construct the strongest possible bear case. Follow the CLAUDE.md debate protocol: write your initial bear thesis first, then when you receive the bull-researcher's arguments, write specific rebuttals. Challenge consensus assumptions.

DEBATE PROTOCOL: After both bull-researcher and bear-researcher complete their initial theses, have them exchange arguments and write one round of rebuttals each. Maximum 2 debate rounds total.

After all teammates complete their work:
As Portfolio Manager, I will synthesize all reports into final per-stock ratings using the 5-tier scale (Buy/Overweight/Hold/Underweight/Sell). I will:
- Weight the composite score as 50% fundamental, 30% sentiment, 20% technical
- DEEP ANALYSIS stocks: full rating with HIGH confidence possible
- STANDARD ANALYSIS stocks: rating with MEDIUM confidence cap
- QUICK CHECK stocks: carry forward last week's rating
- Compare each rating to last week's rating and flag all changes
- Assess portfolio-level risks (concentration, sector skew, currency exposure, correlation)
- Suggest position sizing for new Buy ratings (higher conviction + lower correlation to existing holdings = larger suggested weight)
- Identify top conviction ideas from the watchlist
- Flag any holdings rated Underweight or Sell for review
- Write results to `weekly_reports` table and append to `report_history` table
- Note key events for the coming week (earnings, ex-dividends, macro)
- Report the consensus gate statistics: how many stocks passed each tier
```

---

## Quick Single-Stock Deep Dive Prompt

For ad-hoc deep analysis on a specific stock (e.g., when considering a new position):

```
Run a deep-dive analysis on [TICKER] ([COMPANY NAME]) listed on [MARKET].

Spawn 5 teammates:

1. **fundamental-analyst**: Deep fundamental analysis of [TICKER]. Go beyond surface metrics — analyze the last 3 years of earnings reports, management commentary on capital allocation, competitive position within the Nordic market, and compare valuation to the 3 closest Nordic peers. Check insider transactions for the last 6 months.

2. **sentiment-news-analyst**: Deep sentiment analysis on [TICKER]. Search for all material news from the last 30 days. Check PodSignal data for any podcast mentions. Look for analyst reports, broker target prices, and any recent rating changes. Search Nordic financial media (Børsen, DI, E24) specifically.

3. **technical-analyst**: Full technical analysis of [TICKER]. Pull 1-year price history. Identify the current trend regime, all key support/resistance levels, volume patterns, and whether the stock is showing accumulation or distribution. Compare momentum to the sector and broader Nordic index.

4. **bull-researcher**: After reading all analyst reports, build the most compelling bull case for [TICKER]. What is the best scenario over the next 12 months? What catalysts could drive significant upside? Why is the market wrong if the stock is undervalued?

5. **bear-researcher**: After reading all analyst reports, build the most compelling bear case for [TICKER]. What could go wrong? What risks is the market underpricing? Why might this be a value trap or a momentum trap?

Run the full debate protocol (2 rounds). Then as Portfolio Manager, synthesize into a final rating with a clear recommendation: should I initiate a position, and if so, at what conviction level and suggested portfolio weight?
```

---

## Event-Triggered Alert Prompt

For quick checks when material news breaks on a holding:

```
ALERT CHECK on [TICKER]: [Brief description of the news/event].

This stock is currently in my portfolio at [X]% weight with a [current rating] rating.

Quickly assess: Does this news change the investment thesis? Spawn 3 teammates:

1. **news-assessor**: Evaluate the materiality of this event. Is this a one-off or structural? Quantify the likely impact on earnings/valuation if possible.

2. **bull-defender**: Argue why this news does NOT change the bull case, or why the market will overreact.

3. **bear-challenger**: Argue why this news IS material and what the downside scenario looks like.

Synthesize into: MAINTAIN rating / UPGRADE / DOWNGRADE, with a clear 2-sentence rationale.
```

---

## Setup Checklist

Before first run:

- [ ] Enable Agent Teams: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings
- [ ] Set up Supabase project and run `supabase_schema.sql` to create all tables
- [ ] Populate `holdings` table with current portfolio
- [ ] Populate `watchlist` table with target stocks (start with 30-50, scale to 150)
- [ ] Connect Supabase MCP connector in Claude
- [ ] Copy CLAUDE.md to your project working directory
- [ ] Test with a single-stock deep dive before running the full weekly analysis
- [ ] For scheduled runs: set up via Cowork Desktop scheduled task or Claude Code cloud scheduled task for Sunday evenings

---

## Scaling Notes

**Phase 1 — Personal (now)**
- 20-40 holdings + 30-50 watchlist stocks
- Weekly Agent Teams run via Max subscription
- Supabase as data layer (free tier)
- Automated accuracy tracking via `update_accuracy()` function

**Phase 2 — Validation (months 2-4)**
- Scale watchlist to 100-150 Nordic names
- Split into 3 batch runs if needed (batch A/B/C across the week)
- Accuracy views (`accuracy_summary`, `consensus_gate_effectiveness`) provide continuous validation
- Build PodSignal transcription pipeline writing to `stock_mentions` table (accessed via `pod_signal_view`)

**Phase 3 — Productize (when track record proves value)**
- Migrate to API-based multi-agent orchestration
- Each agent role → dedicated API call with model-per-role optimization
- Supabase already in place — just enable Auth and verify RLS
- Add user authentication, portfolio input, Stripe billing
- Frontend on Vercel (React) reading from Supabase
- Agent prompts and structured formats carry over directly from CLAUDE.md
