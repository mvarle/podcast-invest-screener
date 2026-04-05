# Nordic Portfolio Intelligence — Product Roadmap

## From Personal Tool to Scaled Product

---

## Vision

The only AI-powered investment research platform built specifically for Nordic equities, combining multi-agent analysis with proprietary podcast sentiment data that no competitor can replicate.

---

## Phase 0: Foundation (Weeks 1–2)

### Goal
Get the agent team running on a single stock and validate the output quality.

### What to Build
- Set up Supabase project and run `supabase_schema.sql` to create all tables
- Populate `holdings` table with your current positions (10–20 stocks)
- Add a small watchlist to the `watchlist` table (10–20 Nordic names you know well)
- Place CLAUDE.md in your Claude Code project directory
- Connect Supabase MCP connector in Claude (you already have this)
- Enable Agent Teams experimental flag
- Run a single-stock deep dive on a stock you have strong conviction on (e.g., NKT)
- Compare the agent output against your own thesis — where does it agree, where does it surprise you?

### What to Validate
- Do the agents produce genuinely useful structured output?
- Does the bull/bear debate surface arguments you hadn't considered?
- Can the Agent Teams pipeline read from and write to Supabase reliably via the MCP connector?
- How long does a single-stock run take? (Estimate: 15–25 minutes)

### Stack
- Claude Code + Agent Teams (Max subscription)
- Supabase (free tier is sufficient for personal use)
- Supabase MCP connector
- Your brain as the quality benchmark

### Exit Criteria
You've run 5+ single-stock deep dives and trust the output quality enough to run the full weekly pipeline.

---

## Phase 1: Personal MVP (Weeks 3–8)

### Goal
Weekly automated analysis of your full portfolio and watchlist, building a track record.

### What to Build
- Expand holdings + watchlist to full coverage (30 holdings + 50 watchlist)
- Set up Cowork or Claude Code scheduled task for Sunday evening runs
- Begin populating the `pod_signal` table (manual initially — note podcast mentions as you listen)
- Set up a simple daily cron (GitHub Actions or Supabase edge function) to pull closing prices into `price_data` via yfinance
- Run the full weekly pipeline for 6 consecutive weeks minimum
- After week 4, run `select public.update_accuracy()` to start getting +4W accuracy data
- Check the `accuracy_summary` and `consensus_gate_effectiveness` views

### What to Validate
- Can the system handle 80 stocks in a single Agent Teams session? If not, split into batches
- Are the ratings stable week-over-week for stable stocks? (Low noise test)
- Do rating changes correlate with actual material events? (Signal test)
- How much of your Max quota does a full weekly run consume?
- Where does the system fail? Which agent produces the weakest output?

### Key Metrics to Track
- Rating direction accuracy at +4 weeks
- False alarm rate (rating changes that reverse within 2 weeks)
- Coverage gaps (stocks where data quality is too thin for reliable analysis)
- Token consumption per weekly run

### Stack
- Same as Phase 0
- Cowork scheduled tasks for automation

### Exit Criteria
8+ weeks of track record. Direction accuracy above 55% at +4 weeks. You personally trust the system enough that you check it before making trades.

---

## Phase 2: Data Pipeline (Weeks 6–14, overlaps with Phase 1)

### Goal
Automate the data inputs that are currently manual, especially podcast sentiment.

### What to Build
- PodSignal transcription pipeline: Deepgram API for Nordic podcasts → Claude for entity extraction and sentiment scoring → write to PodSignal tab (or database)
- Automated financial data pull: Python script using yfinance for daily prices, scheduled via cron or GitHub Actions
- News monitoring: RSS feed checker for Børsen, DI, E24 — flags material news on holdings and triggers event alerts
- Insider transaction monitoring: Nasdaq Nordic insider filings feed

### What to Validate
- Deepgram transcription accuracy on Danish/Swedish/Norwegian audio
- Entity extraction reliability: does Claude correctly identify which stock is being discussed?
- Sentiment scoring consistency: does the same type of commentary produce similar scores?
- End-to-end latency: podcast published → sentiment available for next analysis run

### Key Decision
How to handle PodSignal data at scale. The `pod_signal` table is already in Supabase, so the question is purely about the ingestion pipeline: Deepgram transcription → Claude entity extraction → direct insert into Supabase via edge function or Python script. No infrastructure migration needed.

### Stack Addition
- Deepgram API (~$30/month for 25–30 hours of audio)
- Python scripts or Supabase edge functions for automated data ingestion
- GitHub Actions for scheduling daily price pulls and weekly accuracy updates

### Exit Criteria
PodSignal data flows automatically for 10+ Nordic podcasts. Daily price data updates without manual intervention. You have 3+ months of structured sentiment data.

---

## Phase 3: Scale the Analysis (Weeks 12–20)

### Goal
Expand to 150 Nordic stocks and stress-test the system at target scale.

### What to Build
- Expand watchlist to 150 stocks across OMX Copenhagen, Stockholm, Helsinki, and Oslo
- Implement batch processing: split weekly runs into 3 batches of 50 (Mon/Wed/Fri or Sun in 3 sequential runs)
- Add the Caner "sensible screening" logic: tier stocks into A (material change, deep analysis), B (minor change, standard analysis), C (no change, quick confirmation)
- Build the Accuracy Tracker formulas: the `update_accuracy()` function and database views handle this automatically
- First accuracy report: after 12 weeks, query `accuracy_summary`, `consensus_gate_effectiveness`, and `podsignal_effectiveness` views for a systematic assessment

### What to Validate
- Does quality degrade at 150 stocks? (Watch for generic/cookie-cutter analysis)
- Does the tiered screening approach work? (A-tier stocks should get better analysis than spreading thin)
- What's the composite accuracy at +12 weeks? This is the number that matters for productization
- Token economics: can a Max subscription handle 150 stocks weekly? If hitting limits, which stocks can move to biweekly?

### Key Metrics
- Direction accuracy: +4W and +12W by tier (Buy/Sell should be >55%, Hold is noise)
- Sharpe ratio of a hypothetical portfolio following Buy signals vs Nordic index
- Coverage: what % of Nordic stocks with >$500M market cap are covered?
- Cost per stock per analysis run

### Stack Addition
- Consider a simple dashboard (Supabase + React on Vercel, or even a quick Metabase/Grafana connected to Supabase) for personal visualization

### Exit Criteria
150 stocks running reliably. 12+ weeks of accuracy data. Composite direction accuracy above 55%. You have a clear, data-backed answer to "does this system add value?"

---

## Phase 4: Pre-Product Architecture (Weeks 18–26)

### Goal
Build the frontend and migrate the agent pipeline to API for multi-tenancy. Supabase is already the data layer — no database migration needed.

### What to Build
- Enable Supabase Auth for multi-tenancy and verify RLS policies work correctly
- Migrate agent pipeline from Agent Teams to API-based orchestration
  - Each agent role becomes a Claude API call
  - Model-per-role optimization: Haiku for data gathering, Sonnet for sentiment/synthesis, Opus for bull/bear debate
  - Implement the consensus screening gate as a programmatic step between Stage 1 and Stage 2
  - Orchestration via Python (FastAPI) or Supabase edge functions
- Implement Caner-style portfolio optimization
  - Use `pypfopt` or `scikit-learn` for covariance-based weight optimization
  - Input: screened stocks + return history from `price_data` table
  - Output: suggested portfolio weights minimizing correlation and maximizing risk-adjusted returns
  - Start with minimum variance, graduate to Black-Litterman if conviction scores map to expected return views
- Build minimal frontend in React on Vercel
  - Portfolio input screen
  - Weekly report dashboard with consensus gate visualization
  - Single-stock deep dive view
  - Portfolio optimization view: suggested weights vs current weights
  - Accuracy/track record page (your marketing asset)
- Set up proper environments: dev and prod Supabase projects, Vercel preview deployments

### What to Validate
- Does the API-based pipeline produce equivalent output to Agent Teams? Run both in parallel for 2–3 weeks and compare
- Supabase performance: can the analysis pipeline write 150 stock reports in a single batch without timeouts?
- Frontend usability: is the information density right for a mobile screen?
- API cost at scale: what does 150 stocks actually cost per week on the API? Confirm it matches your earlier estimates (~$80–140/month)

### Stack (Full)
- Frontend: React + Tailwind on Vercel ($20/month)
- Backend: Supabase (already set up — upgrade to Pro at $25/month for production reliability)
- AI: Claude API (Haiku + Sonnet + Opus, ~$100–140/month for 150 stocks weekly)
- Transcription: Deepgram (~$30/month)
- Data: yfinance (free) + RSS feeds + Nasdaq Nordic filings
- Scheduling: Supabase edge functions on cron or GitHub Actions

### Exit Criteria
You are using the web app yourself. The API pipeline runs reliably every week. Output quality matches or exceeds the Agent Teams version. The system could onboard a second user today if needed.

---

## Phase 5: Closed Beta (Weeks 24–34)

### Goal
Onboard 10–20 trusted users. Validate product-market fit and pricing willingness.

### What to Build
- User onboarding flow: sign up → add portfolio → first analysis within 24 hours
- Stripe integration: subscription billing (start with single tier, ~199 DKK/month)
- Email notifications: weekly report summary, rating change alerts, event-driven alerts on holdings
- Portfolio import: allow CSV upload of holdings (Nordnet, Saxo, Avanza export formats)
- Privacy: ensure each user can only see their own portfolio and analysis
- Feedback mechanism: simple thumbs up/down on each stock rating + freeform comment
- Track record page: public accuracy dashboard showing system performance (your marketing asset)

### Who to Invite
- Friends/colleagues who invest in Nordic stocks
- PodSignal early users (if any)
- Nordic finance Twitter/LinkedIn contacts
- Podcast hosts you've built relationships with (they might want to test it and talk about it)

### What to Validate
- Will people actually input their portfolio? (Activation metric)
- Do they check the weekly report? (Engagement metric)
- Does anyone change a trade decision based on the analysis? (Value metric)
- What's the #1 feature request? (Roadmap signal)
- Will they pay 199 DKK/month? (Willingness to pay)

### Pricing Exploration
- Free tier: top 10 weekly conviction list (public, drives awareness)
- Paid tier: full 150-stock coverage + portfolio overlay + deep dives + alerts
- Consider: annual discount (1,799 DKK/year = 2 months free)

### Key Metrics
- Activation rate: % of signups who add a portfolio within 7 days
- Weekly engagement: % of users who open the weekly report
- NPS score from beta users
- Churn: who stops logging in and why?

### Exit Criteria
10+ active paying users. NPS above 40. At least 3 users report changing a trade decision based on the system. Clear signal on whether the subscription model works.

---

## Phase 6: Public Launch (Weeks 32–44)

### Goal
Launch publicly to the Nordic retail investor market.

### What to Build
- Landing page with track record showcase and sample analysis
- Content marketing engine: weekly free conviction list published on LinkedIn/X
- Referral system: existing users invite friends for a free month
- Multiple subscription tiers:
  - Free: weekly top 10 Nordic conviction list + limited track record view
  - Standard (199 DKK/month): full 150-stock coverage, weekly reports, email alerts
  - Premium (399 DKK/month): portfolio overlay, unlimited on-demand deep dives, event-driven alerts, priority support
- Broker integration exploration: read-only portfolio sync with Nordnet/Saxo APIs (if available)
- Mobile optimization: the dashboard must work well on phone (most Nordic retail investors check on mobile)

### Go-to-Market
- Nordic finance podcast appearances (you already have relationships via PodSignal)
- LinkedIn content: weekly "here's what our AI agents flagged this week" posts
- Twitter/X Nordic finance community
- Partnerships with Nordic finance content creators
- SEO: "AI aktieanalyse", "Nordic stock analysis", "AI investeringsrådgivning"

### Regulatory
- Consult a Danish lawyer on MiFID II framing before launch
- The product is "informational/educational research" not "personalized investment advice"
- Clear disclaimers on every page and in every report
- Consider registering with Finanstilsynet if the legal advice suggests it's needed

### Infrastructure Scaling
- At 100 users with 150 stocks each: you're not analyzing 15,000 stocks — most users follow the same Nordic names. Deduplicate: run the core analysis once for 150 stocks, then personalize the portfolio overlay per user
- This means API costs scale sub-linearly: 100 users ≈ 2–3× the cost of 1 user, not 100×
- Supabase Pro handles this easily; no infrastructure changes needed until ~1,000 users

### Key Metrics
- MRR (monthly recurring revenue)
- CAC (customer acquisition cost)
- LTV (lifetime value per subscriber)
- Churn rate (target: <5% monthly)
- Track record accuracy (the product lives or dies on this number)

### Exit Criteria
100+ paying subscribers. MRR covers all infrastructure costs + your time. Track record accuracy still holding above 55% direction correct at +12W.

---

## Phase 7: Scale (Months 10–18)

### Goal
Grow to 1,000+ users and explore additional revenue streams.

### What to Build
- B2B white-label offering for Nordic brokers (Nordnet, Saxo, Avanza)
- API-as-a-service: sell the screening signals as a data feed to other fintechs
- Data licensing: PodSignal structured sentiment dataset sold to quant funds and researchers
- European expansion: add stocks from Frankfurt (DAX), Amsterdam (AEX), Paris (CAC 40) — same agent architecture, new data sources
- Advanced features: sector rotation signals, portfolio correlation analysis, tax-loss harvesting suggestions (Denmark-specific)
- Native mobile app (React Native or Expo, reusing the React frontend)

### Infrastructure Evolution
- Consider dedicated compute for the agent pipeline (AWS Lambda or Fly.io)
- Move from single Supabase instance to proper microservices if needed
- Implement caching: most fundamental data doesn't change weekly, avoid redundant API calls
- Consider fine-tuned models for Nordic-specific financial language (especially Danish/Swedish earnings reports)

### Revenue Model at Scale
- Consumer subscriptions: 1,000 users × 199 DKK avg = ~200K DKK/month
- B2B licensing: 1 broker contract could be 50–100K DKK/month
- Data licensing: quant fund deals at 20–50K DKK/month each
- API fees: usage-based pricing for fintech integrations

### Team
- Until Phase 6, this is a solo project
- Phase 6–7: consider hiring a part-time frontend developer and a Nordic market data specialist
- B2B sales requires either your own effort or a business development hire

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Signal accuracy disappoints | Product has no value | Kill the project or pivot to pure content/media play. Honest track record lets you make this call early |
| Claude API pricing changes | Cost structure breaks | Architecture allows model swapping. Can move to DeepSeek, Gemini, or self-hosted Llama for non-debate agents |
| MiFID II regulatory challenge | Forced to shut down or restructure | Legal consultation in Phase 5. Frame as educational research, not advice. Never use the word "recommendation" in the product |
| Nordic data gaps | Analysis quality too low for small caps | Start with large/mid-cap (>2B DKK market cap). Expand coverage only where data supports quality |
| Competitor launches similar product | Market share pressure | PodSignal sentiment data is the moat. Nobody else has structured Nordic podcast sentiment. The track record is the second moat |
| Max subscription limits change | Personal use phase cost increases | Can switch to API earlier than planned. Phase 2 data pipeline work makes this transition straightforward |
| User churn from poor UX | Revenue doesn't grow | Invest in mobile UX early. Nordic retail investors check stocks on their phone during commute |

---

## Success Milestones

| Milestone | Target Date | Metric |
|-----------|------------|--------|
| First Agent Teams run | Week 1 | Single stock deep dive completed |
| First full weekly pipeline | Week 4 | All holdings + watchlist analyzed |
| 12-week track record | Week 16 | Direction accuracy measured |
| API pipeline running | Week 22 | Parity with Agent Teams output |
| First paying beta user | Week 28 | Someone pays 199 DKK |
| 10 paying users | Week 34 | Product-market fit signal |
| Public launch | Week 38 | Landing page live |
| 100 paying users | Week 52 | Sustainable unit economics |
| First B2B contract | Month 14 | Revenue diversification |
| 1,000 users | Month 18 | Scale validated |

---

## The One Thing That Matters

Every phase ultimately depends on one number: **does the system produce signals that make better investment decisions than doing it without the system?**

If the track record proves that — everything else is execution. If it doesn't — you'll know by Week 16 and can stop before spending serious money.

Build the track record first. Everything else follows.
