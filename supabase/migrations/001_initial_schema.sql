-- PodSignal Initial Schema
-- Phase 1: Core tables for podcast ingestion, transcription, and stock mention extraction

-- ============================================================
-- PODCASTS
-- ============================================================
CREATE TABLE podcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rss_feed_url TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EPISODES
-- ============================================================
CREATE TABLE episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id UUID NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  release_date TIMESTAMPTZ NOT NULL,
  episode_guid TEXT UNIQUE NOT NULL,
  audio_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_transcription'
    CHECK (status IN ('pending_transcription', 'transcription_complete', 'analysis_complete', 'error', 'failed')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_episodes_podcast_date ON episodes(podcast_id, release_date DESC);
CREATE INDEX idx_episodes_status ON episodes(status) WHERE status NOT IN ('analysis_complete', 'failed');
CREATE INDEX idx_episodes_release_date ON episodes(release_date DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER episodes_updated_at
  BEFORE UPDATE ON episodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRANSCRIPTS (separate from episodes to avoid bloat)
-- ============================================================
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  raw_deepgram_json JSONB,
  word_count INTEGER,
  language TEXT DEFAULT 'da',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(episode_id)
);

-- ============================================================
-- STOCK TICKER LOOKUP (curated Danish/Nordic stocks)
-- ============================================================
CREATE TABLE stock_tickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  common_names TEXT[] NOT NULL, -- alternative names used in Danish podcasts
  ticker_copenhagen TEXT,       -- e.g., NOVO-B.CO
  ticker_nyse TEXT,             -- e.g., NVO (ADR)
  isin TEXT,
  currency TEXT DEFAULT 'DKK',
  sector TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stock_tickers_name ON stock_tickers USING GIN(common_names);

-- ============================================================
-- STOCK MENTIONS
-- ============================================================
CREATE TABLE stock_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  ticker TEXT,
  company_name TEXT NOT NULL,
  exchange TEXT,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('bullish', 'bearish', 'hold')),
  mention_type TEXT NOT NULL DEFAULT 'investment_call'
    CHECK (mention_type IN ('investment_call', 'comparison', 'passing_mention', 'news_reference')),
  confidence NUMERIC(3,2),
  conviction_strength TEXT CHECK (conviction_strength IN ('strong', 'moderate', 'tentative')),
  speaker TEXT,
  timestamp_in_transcript TEXT,
  quote TEXT NOT NULL,
  reasoning TEXT,
  baseline_price NUMERIC,
  baseline_price_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stock_mentions_episode ON stock_mentions(episode_id);
CREATE INDEX idx_stock_mentions_ticker ON stock_mentions(ticker);
CREATE INDEX idx_stock_mentions_sentiment ON stock_mentions(sentiment);
CREATE INDEX idx_stock_mentions_type ON stock_mentions(mention_type);
CREATE INDEX idx_stock_mentions_speaker ON stock_mentions(speaker);
CREATE INDEX idx_stock_mentions_created ON stock_mentions(created_at DESC);

-- ============================================================
-- PERFORMANCE SNAPSHOTS
-- ============================================================
CREATE TABLE performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mention_id UUID NOT NULL REFERENCES stock_mentions(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('1d', '1w', '1m', '3m', '6m', '1y')),
  snapshot_date DATE NOT NULL,
  closing_price NUMERIC NOT NULL,
  price_change_percent NUMERIC,
  prediction_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mention_id, snapshot_type)
);

CREATE INDEX idx_perf_snapshots_mention ON performance_snapshots(mention_id);

-- ============================================================
-- USERS (extends Supabase Auth)
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  user_type TEXT DEFAULT 'free' CHECK (user_type IN ('free', 'paid')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE podcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_tickers ENABLE ROW LEVEL SECURITY;

-- Public read access to podcasts and stock tickers
CREATE POLICY "podcasts_public_read" ON podcasts FOR SELECT USING (true);
CREATE POLICY "stock_tickers_public_read" ON stock_tickers FOR SELECT USING (true);

-- Episodes: all users can read for now (freemium filter applied in app layer for MVP)
CREATE POLICY "episodes_public_read" ON episodes FOR SELECT USING (true);

-- Transcripts: readable by all (needed for context)
CREATE POLICY "transcripts_public_read" ON transcripts FOR SELECT USING (true);

-- Stock mentions: readable by all
CREATE POLICY "stock_mentions_public_read" ON stock_mentions FOR SELECT USING (true);

-- Performance snapshots: readable by all
CREATE POLICY "perf_snapshots_public_read" ON performance_snapshots FOR SELECT USING (true);

-- Users: can only read own profile
CREATE POLICY "users_read_own" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- SEED: Millionærklubben podcast
-- ============================================================
INSERT INTO podcasts (name, rss_feed_url, description) VALUES (
  'Millionærklubben',
  'https://www.omnycontent.com/d/playlist/1283f5f4-2508-4981-a99f-acb500e64dcf/27dfeb66-f61a-4fcc-aa6d-ad0800b05139/dc61232c-7e07-438e-981a-ad0800b05142/podcast.rss',
  'Den bedste investering er den tid, du lytter. Dansk investerings-podcast fra Euroinvestor.'
);

-- ============================================================
-- SEED: Common Danish/Nordic stock tickers
-- ============================================================
INSERT INTO stock_tickers (company_name, common_names, ticker_copenhagen, ticker_nyse, currency, sector) VALUES
  ('Novo Nordisk', ARRAY['Novo Nordisk', 'Novo', 'NVO'], 'NOVO-B.CO', 'NVO', 'DKK', 'Healthcare'),
  ('A.P. Møller-Mærsk', ARRAY['Mærsk', 'Maersk', 'AP Møller', 'A.P. Møller'], 'MAERSK-B.CO', NULL, 'DKK', 'Shipping'),
  ('Carlsberg', ARRAY['Carlsberg'], 'CARL-B.CO', NULL, 'DKK', 'Consumer Staples'),
  ('Vestas Wind Systems', ARRAY['Vestas', 'Vestas Wind'], 'VWS.CO', 'VWDRY', 'DKK', 'Energy'),
  ('Danske Bank', ARRAY['Danske Bank', 'Danske'], 'DANSKE.CO', NULL, 'DKK', 'Financials'),
  ('Nordea Bank', ARRAY['Nordea'], 'NDA-DK.CO', NULL, 'DKK', 'Financials'),
  ('Pandora', ARRAY['Pandora'], 'PNDORA.CO', NULL, 'DKK', 'Consumer Discretionary'),
  ('DSV', ARRAY['DSV', 'DSV Panalpina'], 'DSV.CO', NULL, 'DKK', 'Logistics'),
  ('Coloplast', ARRAY['Coloplast'], 'COLO-B.CO', NULL, 'DKK', 'Healthcare'),
  ('Ørsted', ARRAY['Ørsted', 'Orsted'], 'ORSTED.CO', NULL, 'DKK', 'Energy'),
  ('Genmab', ARRAY['Genmab'], 'GMAB.CO', 'GMAB', 'DKK', 'Healthcare'),
  ('Demant', ARRAY['Demant', 'William Demant'], 'DEMANT.CO', NULL, 'DKK', 'Healthcare'),
  ('Bavarian Nordic', ARRAY['Bavarian Nordic', 'Bavarian'], 'BAVA.CO', NULL, 'DKK', 'Healthcare'),
  ('Tryg', ARRAY['Tryg'], 'TRYG.CO', NULL, 'DKK', 'Insurance'),
  ('Jyske Bank', ARRAY['Jyske Bank', 'Jyske'], 'JYSK.CO', NULL, 'DKK', 'Financials'),
  ('Netcompany', ARRAY['Netcompany'], 'NETC.CO', NULL, 'DKK', 'Technology'),
  ('ISS', ARRAY['ISS'], 'ISS.CO', NULL, 'DKK', 'Industrials'),
  ('GN Store Nord', ARRAY['GN Store Nord', 'GN Audio', 'GN'], 'GN.CO', NULL, 'DKK', 'Technology'),
  ('Rockwool', ARRAY['Rockwool'], 'ROCK-B.CO', NULL, 'DKK', 'Industrials'),
  ('Ambu', ARRAY['Ambu'], 'AMBU-B.CO', NULL, 'DKK', 'Healthcare'),
  ('FLSmidth', ARRAY['FLSmidth', 'FL Smith'], 'FLS.CO', NULL, 'DKK', 'Industrials'),
  ('Alk-Abelló', ARRAY['ALK', 'Alk-Abelló'], 'ALK-B.CO', NULL, 'DKK', 'Healthcare'),
  ('Topdanmark', ARRAY['Topdanmark'], 'TOP.CO', NULL, 'DKK', 'Insurance'),
  ('Spar Nord Bank', ARRAY['Spar Nord'], 'SPNO.CO', NULL, 'DKK', 'Financials'),
  ('SimCorp', ARRAY['SimCorp'], 'SIM.CO', NULL, 'DKK', 'Technology'),
  ('Zealand Pharma', ARRAY['Zealand Pharma', 'Zealand'], 'ZEAL.CO', NULL, 'DKK', 'Healthcare'),
  ('Royal Unibrew', ARRAY['Royal Unibrew', 'Royal'], 'RBREW.CO', NULL, 'DKK', 'Consumer Staples'),
  ('NKT', ARRAY['NKT'], 'NKT.CO', NULL, 'DKK', 'Industrials'),
  ('Lundbeck', ARRAY['Lundbeck', 'H. Lundbeck'], 'LUN.CO', NULL, 'DKK', 'Healthcare'),
  ('Scandinavian Tobacco Group', ARRAY['Scandinavian Tobacco', 'STG'], 'STG.CO', NULL, 'DKK', 'Consumer Staples'),
  ('DFDS', ARRAY['DFDS'], 'DFDS.CO', NULL, 'DKK', 'Shipping'),
  ('Össur', ARRAY['Össur', 'Ossur'], 'OSSR.CO', NULL, 'DKK', 'Healthcare'),
  ('ChemoMetec', ARRAY['ChemoMetec'], 'CHEM.CO', NULL, 'DKK', 'Healthcare'),
  ('Coriata', ARRAY['Coriata'], NULL, NULL, 'DKK', 'Consumer Staples'),
  ('Bavarian Nordic', ARRAY['Bavarian', 'Bavarian Nordic'], 'BAVA.CO', NULL, 'DKK', 'Healthcare'),
  -- Major international stocks commonly discussed
  ('Apple', ARRAY['Apple'], NULL, 'AAPL', 'USD', 'Technology'),
  ('Microsoft', ARRAY['Microsoft'], NULL, 'MSFT', 'USD', 'Technology'),
  ('NVIDIA', ARRAY['Nvidia', 'NVIDIA'], NULL, 'NVDA', 'USD', 'Technology'),
  ('Tesla', ARRAY['Tesla'], NULL, 'TSLA', 'USD', 'Technology'),
  ('Amazon', ARRAY['Amazon'], NULL, 'AMZN', 'USD', 'Technology'),
  ('Alphabet', ARRAY['Google', 'Alphabet'], NULL, 'GOOGL', 'USD', 'Technology'),
  ('Meta Platforms', ARRAY['Meta', 'Facebook'], NULL, 'META', 'USD', 'Technology');
