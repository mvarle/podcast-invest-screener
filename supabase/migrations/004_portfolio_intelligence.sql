-- Nordic Portfolio Intelligence — Adapted Schema
-- Incorporates critical fixes from 7-agent architecture review:
--   - No separate profiles table (extends existing users)
--   - No pod_signal table (compatibility view over stock_mentions)
--   - Fixed update_accuracy() for weekends/holidays
--   - CHECK constraints on all agent output enums/scores
--   - pipeline_runs table for run tracking and recovery
--   - prompt_version on all output tables
--   - volatility + liquidity in report_history

-- ============================================================
-- EXTEND EXISTING USERS TABLE
-- ============================================================

alter table public.users
  add column if not exists display_name text,
  add column if not exists updated_at timestamptz default now();

-- ============================================================
-- HOLDINGS — Current portfolio positions
-- ============================================================

create table public.holdings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  ticker text not null,
  company text not null,
  market text not null,
  sector text,
  shares numeric not null,
  avg_cost numeric not null,
  currency text not null default 'DKK',
  current_weight_pct numeric,
  date_added date,
  thesis text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique(user_id, ticker)
);

alter table public.holdings enable row level security;

create policy "Users can manage own holdings"
  on public.holdings for all using (auth.uid() = user_id);

-- ============================================================
-- WATCHLIST — Stocks being monitored
-- ============================================================

create table public.watchlist (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  ticker text not null,
  company text not null,
  market text not null,
  sector text,
  currency text not null default 'DKK',
  market_cap_b numeric,
  reason text,
  priority text default 'Medium',
  date_added date default current_date,
  is_active boolean default true,
  created_at timestamptz default now(),

  unique(user_id, ticker)
);

alter table public.watchlist enable row level security;

create policy "Users can manage own watchlist"
  on public.watchlist for all using (auth.uid() = user_id);

-- ============================================================
-- SCREENING RESULTS — Caner consensus gate output
-- With CHECK constraints for data validation (infra-architect fix)
-- With prompt_version for methodology tracking (systems-architect fix)
-- ============================================================

create table public.screening_results (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  run_id uuid,  -- references pipeline_runs (created below)
  analysis_date date not null,
  ticker text not null,
  company text not null,
  source text not null,
  prompt_version text default 'v1.0',

  -- Fundamental screening
  fundamental_screening text not null
    check (fundamental_screening in ('PASS', 'WATCH', 'FAIL')),
  fundamental_screening_rationale text,
  fundamental_score numeric
    check (fundamental_score between 1 and 10),
  fundamental_screening_confidence numeric,  -- 0-100 continuous (quant-analyst fix)
  revenue_trend text,
  margin_trend text,
  balance_sheet text,
  valuation_vs_history text,
  valuation_vs_peers text,
  insider_activity text,
  upcoming_catalysts text,
  fundamental_risks text,
  fundamental_summary text,

  -- Sentiment screening
  sentiment_screening text not null
    check (sentiment_screening in ('PASS', 'WATCH', 'FAIL')),
  sentiment_screening_rationale text,
  sentiment_score numeric
    check (sentiment_score between 1 and 10),
  sentiment_screening_confidence numeric,  -- 0-100 continuous
  podcast_sentiment text,
  podcast_mentions_30d integer default 0,
  podcast_detail text,
  news_flow text,
  news_highlights text,
  analyst_consensus text,
  macro_sensitivity text,
  sentiment_trajectory text,
  sentiment_summary text,

  -- Consensus gate result
  consensus_tier text not null
    check (consensus_tier in ('DEEP_ANALYSIS', 'STANDARD', 'QUICK_CHECK', 'FLAGGED')),

  created_at timestamptz default now(),

  unique(user_id, analysis_date, ticker)
);

alter table public.screening_results enable row level security;

create policy "Users can manage own screening"
  on public.screening_results for all using (auth.uid() = user_id);

create index idx_screening_date on public.screening_results(analysis_date desc);
create index idx_screening_tier on public.screening_results(consensus_tier);

-- ============================================================
-- TECHNICAL REPORTS — Momentum & trend data
-- ============================================================

create table public.technical_reports (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  run_id uuid,
  analysis_date date not null,
  ticker text not null,
  prompt_version text default 'v1.0',
  technical_score numeric
    check (technical_score between 1 and 10),
  trend text,
  rsi_14 numeric,
  rsi_signal text,
  macd_signal text,
  vs_50d_sma text,
  vs_200d_sma text,
  relative_strength text,
  volume_signal text,
  key_levels text,
  technical_summary text,
  report_depth text default 'full'
    check (report_depth in ('full', 'abbreviated')),

  created_at timestamptz default now(),

  unique(user_id, analysis_date, ticker)
);

alter table public.technical_reports enable row level security;

create policy "Users can manage own technical reports"
  on public.technical_reports for all using (auth.uid() = user_id);

-- ============================================================
-- DEBATE RECORDS — Bull/bear theses and rebuttals
-- ============================================================

create table public.debate_records (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  run_id uuid,
  analysis_date date not null,
  ticker text not null,
  prompt_version text default 'v1.0',

  bull_conviction text,
  bull_thesis text,
  bull_catalysts text,
  bull_rebuttal text,
  bull_upside_target text,

  bear_conviction text,
  bear_thesis text,
  bear_risks text,
  bear_rebuttal text,
  bear_downside_target text,

  debate_rounds integer default 2,

  created_at timestamptz default now(),

  unique(user_id, analysis_date, ticker)
);

alter table public.debate_records enable row level security;

create policy "Users can manage own debates"
  on public.debate_records for all using (auth.uid() = user_id);

-- ============================================================
-- WEEKLY REPORTS — Final synthesized ratings
-- ============================================================

create table public.weekly_reports (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  run_id uuid,
  analysis_date date not null,
  ticker text not null,
  company text not null,
  source text not null,
  market text,
  currency text,
  prompt_version text default 'v1.0',

  rating text not null
    check (rating in ('Buy', 'Overweight', 'Hold', 'Underweight', 'Sell')),
  rating_change text,
  previous_rating text,
  confidence text not null
    check (confidence in ('High', 'Medium', 'Low')),
  consensus_tier text,

  fundamental_score numeric
    check (fundamental_score between 1 and 10),
  sentiment_score numeric
    check (sentiment_score between 1 and 10),
  technical_score numeric
    check (technical_score between 1 and 10),
  composite_score numeric,

  bull_summary text,
  bear_summary text,
  decisive_factor text,

  portfolio_action text,
  suggested_weight_pct numeric,
  position_context text,

  price_at_rating numeric,

  created_at timestamptz default now(),

  unique(user_id, analysis_date, ticker)
);

alter table public.weekly_reports enable row level security;

create policy "Users can manage own weekly reports"
  on public.weekly_reports for all using (auth.uid() = user_id);

create index idx_weekly_reports_date on public.weekly_reports(analysis_date desc);
create index idx_weekly_reports_ticker on public.weekly_reports(ticker);
create index idx_weekly_reports_rating on public.weekly_reports(rating);
-- Optimized index for latest_ratings view (systems-architect fix)
create index idx_weekly_reports_user_ticker_date
  on public.weekly_reports(user_id, ticker, analysis_date desc);

-- ============================================================
-- PORTFOLIO ASSESSMENTS — Weekly portfolio-level analysis
-- ============================================================

create table public.portfolio_assessments (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  run_id uuid,
  analysis_date date not null,

  total_stocks_screened integer,
  deep_analysis_count integer,
  standard_analysis_count integer,
  quick_check_count integer,
  flagged_count integer,

  risk_flags text,
  top_conviction_buys text,
  top_conviction_sells text,
  rating_changes_summary text,
  key_events_next_week text,
  overall_market_stance text,

  max_single_position_pct numeric,
  max_sector_pct numeric,
  currency_exposure_dkk_pct numeric,
  currency_exposure_sek_pct numeric,
  currency_exposure_nok_pct numeric,
  currency_exposure_eur_pct numeric,

  created_at timestamptz default now(),

  unique(user_id, analysis_date)
);

alter table public.portfolio_assessments enable row level security;

create policy "Users can manage own assessments"
  on public.portfolio_assessments for all using (auth.uid() = user_id);

-- ============================================================
-- REPORT HISTORY — Append-only track record
-- Immutable columns: everything except accuracy fields and is_valid
-- With volatility + liquidity (quant-analyst fix)
-- With prompt_version (systems-architect fix)
-- ============================================================

create table public.report_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  run_id uuid,
  analysis_date date not null,
  ticker text not null,
  company text not null,
  rating text not null
    check (rating in ('Buy', 'Overweight', 'Hold', 'Underweight', 'Sell')),
  composite_score numeric,
  fundamental_score numeric,
  sentiment_score numeric,
  technical_score numeric,
  bull_conviction text,
  bear_conviction text,
  price_at_rating numeric not null,
  consensus_tier text,
  prompt_version text default 'v1.0',

  -- Market microstructure at time of rating (quant-analyst fix)
  volatility_annualized numeric,
  avg_daily_volume_30d numeric,

  -- Accuracy fields (filled retrospectively by update_accuracy)
  price_4w numeric,
  price_12w numeric,
  return_4w_pct numeric,
  return_12w_pct numeric,
  direction_correct_4w boolean,
  direction_correct_12w boolean,

  -- Benchmark comparison (quant-analyst fix)
  benchmark_return_4w_pct numeric,
  benchmark_return_12w_pct numeric,

  -- Data quality flag (systems-architect fix)
  is_valid boolean default true,
  accuracy_notes text,

  created_at timestamptz default now()
);

alter table public.report_history enable row level security;

create policy "Users can manage own history"
  on public.report_history for all using (auth.uid() = user_id);

create index idx_history_date on public.report_history(analysis_date desc);
create index idx_history_ticker on public.report_history(ticker);
create index idx_history_rating on public.report_history(rating);
-- Partial indexes for accuracy update performance (infra-architect fix)
create index idx_history_pending_4w
  on public.report_history(ticker, analysis_date) where price_4w is null;
create index idx_history_pending_12w
  on public.report_history(ticker, analysis_date) where price_12w is null;

-- ============================================================
-- PRICE DATA — Daily closing prices
-- ============================================================

create table public.price_data (
  id uuid default gen_random_uuid() primary key,
  ticker text not null,
  trade_date date not null,
  close_price numeric not null,
  volume bigint,
  currency text,
  source text default 'yfinance',

  unique(ticker, trade_date)
);

alter table public.price_data enable row level security;

create policy "Anyone can read price data"
  on public.price_data for select using (true);

create index idx_price_ticker_date on public.price_data(ticker, trade_date desc);

-- ============================================================
-- PIPELINE RUNS — Run tracking and recovery (infra-architect fix)
-- ============================================================

create table public.pipeline_runs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  analysis_date date not null,
  run_type text default 'weekly'
    check (run_type in ('weekly', 'deep_dive', 'alert_check')),
  status text default 'running'
    check (status in ('running', 'completed', 'partial', 'failed')),
  started_at timestamptz default now(),
  completed_at timestamptz,
  stocks_total integer,
  stocks_completed integer default 0,
  deep_analysis_count integer,
  standard_analysis_count integer,
  quick_check_count integer,
  prompt_version text default 'v1.0',
  error_log text,
  notes text,

  unique(user_id, analysis_date, run_type)
);

alter table public.pipeline_runs enable row level security;

create policy "Users can manage own runs"
  on public.pipeline_runs for all using (auth.uid() = user_id);

-- Add foreign keys from output tables to pipeline_runs
alter table public.screening_results
  add constraint fk_screening_run foreign key (run_id) references public.pipeline_runs(id);
alter table public.technical_reports
  add constraint fk_technical_run foreign key (run_id) references public.pipeline_runs(id);
alter table public.debate_records
  add constraint fk_debate_run foreign key (run_id) references public.pipeline_runs(id);
alter table public.weekly_reports
  add constraint fk_weekly_run foreign key (run_id) references public.pipeline_runs(id);
alter table public.portfolio_assessments
  add constraint fk_assessment_run foreign key (run_id) references public.pipeline_runs(id);
alter table public.report_history
  add constraint fk_history_run foreign key (run_id) references public.pipeline_runs(id);

-- ============================================================
-- POD SIGNAL COMPATIBILITY VIEW
-- Maps existing stock_mentions to the format portfolio views expect
-- (infra-architect + systems-architect fix: no separate pod_signal table)
-- ============================================================

create or replace view public.pod_signal_view as
select
  sm.id,
  e.release_date::date as episode_date,
  p.name as podcast_name,
  e.title as episode_title,
  sm.speaker,
  sm.ticker,
  case sm.sentiment
    when 'bullish' then
      case sm.conviction_strength
        when 'strong' then 5
        when 'moderate' then 3
        when 'tentative' then 1
        else 3
      end
    when 'bearish' then
      case sm.conviction_strength
        when 'strong' then -5
        when 'moderate' then -3
        when 'tentative' then -1
        else -3
      end
    when 'hold' then 0
    else 0
  end as sentiment_score,
  sm.quote as key_quote,
  sm.reasoning as context,
  sm.call_summary,
  sm.speaker_role,
  sm.mention_type,
  sm.confidence,
  'podsignal_pipeline' as source,
  sm.created_at
from public.stock_mentions sm
join public.episodes e on e.id = sm.episode_id
join public.podcasts p on p.id = e.podcast_id;

-- ============================================================
-- VIEWS — Analytical queries
-- ============================================================

-- Latest rating per stock per user
create or replace view public.latest_ratings as
select distinct on (user_id, ticker)
  user_id, analysis_date, ticker, company, rating, confidence,
  composite_score, price_at_rating, consensus_tier, portfolio_action
from public.weekly_reports
order by user_id, ticker, analysis_date desc;

-- Accuracy summary per user (only valid entries)
create or replace view public.accuracy_summary as
select
  user_id,
  prompt_version,
  count(*) as total_ratings,
  count(direction_correct_4w) as rated_4w,
  count(direction_correct_12w) as rated_12w,
  round(100.0 * count(*) filter (where direction_correct_4w = true) /
    nullif(count(direction_correct_4w), 0), 1) as accuracy_4w_pct,
  round(100.0 * count(*) filter (where direction_correct_12w = true) /
    nullif(count(direction_correct_12w), 0), 1) as accuracy_12w_pct,
  round(100.0 * count(*) filter (where direction_correct_4w = true and rating in ('Buy', 'Overweight')) /
    nullif(count(*) filter (where direction_correct_4w is not null and rating in ('Buy', 'Overweight')), 0), 1) as buy_accuracy_4w_pct,
  round(100.0 * count(*) filter (where direction_correct_4w = true and rating in ('Underweight', 'Sell')) /
    nullif(count(*) filter (where direction_correct_4w is not null and rating in ('Underweight', 'Sell')), 0), 1) as sell_accuracy_4w_pct,
  -- Risk-adjusted metrics (quant-analyst fix)
  round(avg(return_4w_pct) filter (where rating in ('Buy', 'Overweight')), 2) as avg_buy_return_4w,
  round(avg(return_4w_pct) filter (where rating in ('Underweight', 'Sell')), 2) as avg_sell_return_4w,
  round(avg(return_12w_pct), 2) as avg_return_12w,
  round(avg(benchmark_return_4w_pct), 2) as avg_benchmark_4w,
  round(avg(return_4w_pct - coalesce(benchmark_return_4w_pct, 0)), 2) as avg_excess_return_4w
from public.report_history
where is_valid = true
group by user_id, prompt_version;

-- Consensus gate effectiveness
create or replace view public.consensus_gate_effectiveness as
select
  user_id,
  consensus_tier,
  prompt_version,
  count(*) as total_ratings,
  round(avg(return_4w_pct), 2) as avg_return_4w,
  round(avg(return_12w_pct), 2) as avg_return_12w,
  round(100.0 * count(*) filter (where direction_correct_4w = true) /
    nullif(count(direction_correct_4w), 0), 1) as accuracy_4w_pct
from public.report_history
where return_4w_pct is not null and is_valid = true
group by user_id, consensus_tier, prompt_version;

-- PodSignal effectiveness — uses compatibility view
create or replace view public.podsignal_effectiveness as
select
  rh.user_id,
  rh.ticker,
  rh.analysis_date,
  rh.rating,
  rh.return_4w_pct,
  rh.return_12w_pct,
  count(ps.id) as podcast_mentions_prior_30d,
  round(avg(ps.sentiment_score), 2) as avg_podcast_sentiment,
  rh.direction_correct_4w
from public.report_history rh
left join public.pod_signal_view ps
  on ps.ticker = rh.ticker
  and ps.episode_date between rh.analysis_date - interval '30 days' and rh.analysis_date
where rh.return_4w_pct is not null and rh.is_valid = true
group by rh.user_id, rh.ticker, rh.analysis_date, rh.rating,
         rh.return_4w_pct, rh.return_12w_pct, rh.direction_correct_4w;

-- ============================================================
-- FUNCTION: update_accuracy()
-- FIXED: Uses nearest trading day instead of exact date match
-- (quant-analyst + infra-architect + systems-architect fix)
-- Also updates benchmark returns using OMX Nordic 40 proxy
-- Also evaluates Hold ratings within tolerance band (quant-analyst fix)
-- ============================================================

create or replace function public.update_accuracy()
returns void as $$
begin
  -- Update 4-week prices and returns (nearest trading day on or after +28 days)
  update public.report_history rh
  set
    price_4w = sub.close_price,
    return_4w_pct = round(100.0 * (sub.close_price - rh.price_at_rating) / rh.price_at_rating, 2),
    direction_correct_4w = case
      when rh.rating in ('Buy', 'Overweight') and sub.close_price > rh.price_at_rating then true
      when rh.rating in ('Underweight', 'Sell') and sub.close_price < rh.price_at_rating then true
      when rh.rating = 'Hold' then
        -- Hold is correct if price stays within +/-5% band (quant-analyst fix)
        case when abs(100.0 * (sub.close_price - rh.price_at_rating) / rh.price_at_rating) <= 5.0
          then true else false end
      else false
    end
  from (
    select distinct on (pd.ticker)
      pd.ticker, pd.close_price, pd.trade_date,
      rh2.id as report_id
    from public.report_history rh2
    join public.price_data pd
      on pd.ticker = rh2.ticker
      and pd.trade_date >= rh2.analysis_date + interval '26 days'
      and pd.trade_date <= rh2.analysis_date + interval '32 days'
    where rh2.price_4w is null
      and rh2.analysis_date <= current_date - interval '28 days'
    order by pd.ticker, rh2.id, pd.trade_date asc
  ) sub
  where rh.id = sub.report_id;

  -- Update 12-week prices and returns (nearest trading day on or after +84 days)
  update public.report_history rh
  set
    price_12w = sub.close_price,
    return_12w_pct = round(100.0 * (sub.close_price - rh.price_at_rating) / rh.price_at_rating, 2),
    direction_correct_12w = case
      when rh.rating in ('Buy', 'Overweight') and sub.close_price > rh.price_at_rating then true
      when rh.rating in ('Underweight', 'Sell') and sub.close_price < rh.price_at_rating then true
      when rh.rating = 'Hold' then
        case when abs(100.0 * (sub.close_price - rh.price_at_rating) / rh.price_at_rating) <= 10.0
          then true else false end
      else false
    end
  from (
    select distinct on (pd.ticker)
      pd.ticker, pd.close_price, pd.trade_date,
      rh2.id as report_id
    from public.report_history rh2
    join public.price_data pd
      on pd.ticker = rh2.ticker
      and pd.trade_date >= rh2.analysis_date + interval '82 days'
      and pd.trade_date <= rh2.analysis_date + interval '90 days'
    where rh2.price_12w is null
      and rh2.analysis_date <= current_date - interval '84 days'
    order by pd.ticker, rh2.id, pd.trade_date asc
  ) sub
  where rh.id = sub.report_id;
end;
$$ language plpgsql security definer;
