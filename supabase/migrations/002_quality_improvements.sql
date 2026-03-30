-- ============================================================
-- Migration 002: Quality Improvements
-- Adds ticker_primary/exchange columns, expands stock coverage,
-- adds hosts metadata to podcasts table
-- ============================================================

-- ============================================================
-- 1. Add ticker_primary and exchange to stock_tickers
-- ============================================================
ALTER TABLE stock_tickers ADD COLUMN IF NOT EXISTS ticker_primary TEXT;
ALTER TABLE stock_tickers ADD COLUMN IF NOT EXISTS exchange TEXT;

-- Backfill from existing data
UPDATE stock_tickers SET
  ticker_primary = COALESCE(ticker_copenhagen, ticker_nyse),
  exchange = CASE
    WHEN ticker_copenhagen IS NOT NULL THEN 'CPH'
    WHEN ticker_nyse IS NOT NULL THEN 'NYSE'
    ELSE NULL
  END
WHERE ticker_primary IS NULL;

-- ============================================================
-- 2. Add hosts JSONB column to podcasts
-- ============================================================
ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS hosts JSONB;

-- Seed Millionærklubben hosts
UPDATE podcasts SET hosts = '[
  {"name": "Lars Tvede", "role": "host"},
  {"name": "Michael Friis Jørgensen", "role": "host"},
  {"name": "Laura Undall Ross", "role": "host"},
  {"name": "Lau Svendsen", "role": "regular_guest"},
  {"name": "Lars Persson", "role": "regular_guest"},
  {"name": "Ole Søeberg", "role": "regular_guest"},
  {"name": "Helle Snedker", "role": "regular_guest"},
  {"name": "Klaus Ekman", "role": "regular_guest"}
]'::jsonb
WHERE name = 'Millionærklubben';

-- ============================================================
-- 3. Expand stock_tickers with more companies
-- ============================================================

-- Tier 1: Stocks already appearing in transcripts but missing from lookup
INSERT INTO stock_tickers (company_name, common_names, ticker_primary, exchange, currency, sector) VALUES
  ('ASML', ARRAY['ASML', 'ASML Holding'], 'ASML.AS', 'AMS', 'EUR', 'Technology'),
  ('AMD', ARRAY['AMD', 'Advanced Micro Devices'], 'AMD', 'NASDAQ', 'USD', 'Technology'),
  ('Micron Technology', ARRAY['Micron', 'Micron Technology'], 'MU', 'NASDAQ', 'USD', 'Technology'),
  ('Accenture', ARRAY['Accenture'], 'ACN', 'NYSE', 'USD', 'Technology'),
  ('Adobe', ARRAY['Adobe'], 'ADBE', 'NASDAQ', 'USD', 'Technology'),
  ('Corning', ARRAY['Corning'], 'GLW', 'NYSE', 'USD', 'Technology'),
  ('TGS-NOPEC', ARRAY['TGS', 'TGS-NOPEC', 'TGS Nopec'], 'TGS.OL', 'OSL', 'NOK', 'Energy'),
  ('BW LPG', ARRAY['BW LPG', 'BW-LPG'], 'BWLPG.OL', 'OSL', 'NOK', 'Shipping'),
  ('Reply', ARRAY['Reply'], 'REY.MI', 'MIL', 'EUR', 'Technology'),
  ('Elisa', ARRAY['Elisa'], 'ELISA.HE', 'HEL', 'EUR', 'Telecom'),
  ('TSMC', ARRAY['TSMC', 'Taiwan Semiconductor'], 'TSM', 'NYSE', 'USD', 'Technology'),
  ('H&M', ARRAY['H&M', 'Hennes & Mauritz', 'HM'], 'HM-B.ST', 'STO', 'SEK', 'Consumer Discretionary'),
  ('Porsche', ARRAY['Porsche'], 'P911.DE', 'FRA', 'EUR', 'Consumer Discretionary'),
  ('Ferrari', ARRAY['Ferrari'], 'RACE', 'NYSE', 'EUR', 'Consumer Discretionary'),
  ('Campari', ARRAY['Campari', 'Davide Campari'], 'CPR.MI', 'MIL', 'EUR', 'Consumer Staples'),
  ('Michelin', ARRAY['Michelin'], 'ML.PA', 'PAR', 'EUR', 'Consumer Discretionary'),
  ('Johnson & Johnson', ARRAY['Johnson & Johnson', 'J&J', 'Johnson and Johnson'], 'JNJ', 'NYSE', 'USD', 'Healthcare'),
  ('UnitedHealth', ARRAY['UnitedHealth', 'United Health', 'UnitedHealth Group'], 'UNH', 'NYSE', 'USD', 'Healthcare'),
  ('Marvell Technology', ARRAY['Marvell', 'Marvell Technology'], 'MRVL', 'NASDAQ', 'USD', 'Technology'),
  ('Universal Display', ARRAY['Universal Display', 'Universal Display Corporation'], 'OLED', 'NASDAQ', 'USD', 'Technology'),
  ('Broadcom', ARRAY['Broadcom'], 'AVGO', 'NASDAQ', 'USD', 'Technology'),
  ('Equinor', ARRAY['Equinor', 'Statoil'], 'EQNR.OL', 'OSL', 'NOK', 'Energy'),
  ('NTG Nordic Transport', ARRAY['NTG', 'NTG Nordic Transport', 'Nordic Transport Group'], 'NTG.CO', 'CPH', 'DKK', 'Logistics'),
  ('NAT', ARRAY['NAT', 'Nordic American Tankers'], 'NAT', 'NYSE', 'USD', 'Shipping')
ON CONFLICT DO NOTHING;

-- Tier 2: Major Scandinavian stocks
INSERT INTO stock_tickers (company_name, common_names, ticker_primary, exchange, currency, sector) VALUES
  ('Ericsson', ARRAY['Ericsson'], 'ERIC-B.ST', 'STO', 'SEK', 'Technology'),
  ('Volvo', ARRAY['Volvo', 'Volvo Group'], 'VOLV-B.ST', 'STO', 'SEK', 'Industrials'),
  ('Atlas Copco', ARRAY['Atlas Copco'], 'ATCO-A.ST', 'STO', 'SEK', 'Industrials'),
  ('Investor AB', ARRAY['Investor', 'Investor AB'], 'INVE-B.ST', 'STO', 'SEK', 'Financials'),
  ('Hexagon', ARRAY['Hexagon'], 'HEXA-B.ST', 'STO', 'SEK', 'Technology'),
  ('Sandvik', ARRAY['Sandvik'], 'SAND.ST', 'STO', 'SEK', 'Industrials'),
  ('SEB', ARRAY['SEB', 'Skandinaviska Enskilda Banken'], 'SEB-A.ST', 'STO', 'SEK', 'Financials'),
  ('Swedbank', ARRAY['Swedbank'], 'SWED-A.ST', 'STO', 'SEK', 'Financials'),
  ('Spotify', ARRAY['Spotify'], 'SPOT', 'NYSE', 'USD', 'Technology'),
  ('DNB', ARRAY['DNB', 'DNB Bank'], 'DNB.OL', 'OSL', 'NOK', 'Financials'),
  ('Telenor', ARRAY['Telenor'], 'TEL.OL', 'OSL', 'NOK', 'Telecom'),
  ('Yara International', ARRAY['Yara', 'Yara International'], 'YAR.OL', 'OSL', 'NOK', 'Materials'),
  ('Kongsberg Gruppen', ARRAY['Kongsberg', 'Kongsberg Gruppen'], 'KOG.OL', 'OSL', 'NOK', 'Industrials'),
  ('Nokia', ARRAY['Nokia'], 'NOKIA.HE', 'HEL', 'EUR', 'Technology'),
  ('Sampo', ARRAY['Sampo'], 'SAMPO.HE', 'HEL', 'EUR', 'Insurance'),
  ('UPM-Kymmene', ARRAY['UPM', 'UPM-Kymmene'], 'UPM.HE', 'HEL', 'EUR', 'Materials'),
  ('Kone', ARRAY['Kone'], 'KNEBV.HE', 'HEL', 'EUR', 'Industrials'),
  ('Fortum', ARRAY['Fortum'], 'FORTUM.HE', 'HEL', 'EUR', 'Energy'),
  ('Neste', ARRAY['Neste'], 'NESTE.HE', 'HEL', 'EUR', 'Energy'),
  ('Husqvarna', ARRAY['Husqvarna'], 'HUSQ-B.ST', 'STO', 'SEK', 'Industrials')
ON CONFLICT DO NOTHING;

-- Tier 3: Additional US/European stocks
INSERT INTO stock_tickers (company_name, common_names, ticker_primary, exchange, currency, sector) VALUES
  ('Eli Lilly', ARRAY['Eli Lilly', 'Lilly'], 'LLY', 'NYSE', 'USD', 'Healthcare'),
  ('JPMorgan Chase', ARRAY['JPMorgan', 'JP Morgan', 'JPMorgan Chase'], 'JPM', 'NYSE', 'USD', 'Financials'),
  ('Berkshire Hathaway', ARRAY['Berkshire Hathaway', 'Berkshire'], 'BRK-B', 'NYSE', 'USD', 'Financials'),
  ('Netflix', ARRAY['Netflix'], 'NFLX', 'NASDAQ', 'USD', 'Technology'),
  ('Palantir', ARRAY['Palantir', 'Palantir Technologies'], 'PLTR', 'NYSE', 'USD', 'Technology'),
  ('CrowdStrike', ARRAY['CrowdStrike'], 'CRWD', 'NASDAQ', 'USD', 'Technology'),
  ('Salesforce', ARRAY['Salesforce'], 'CRM', 'NYSE', 'USD', 'Technology'),
  ('LVMH', ARRAY['LVMH', 'Louis Vuitton', 'Moët Hennessy'], 'MC.PA', 'PAR', 'EUR', 'Consumer Discretionary'),
  ('SAP', ARRAY['SAP'], 'SAP.DE', 'FRA', 'EUR', 'Technology'),
  ('Siemens', ARRAY['Siemens'], 'SIE.DE', 'FRA', 'EUR', 'Industrials'),
  ('TotalEnergies', ARRAY['Total', 'TotalEnergies'], 'TTE.PA', 'PAR', 'EUR', 'Energy'),
  ('Shell', ARRAY['Shell', 'Royal Dutch Shell'], 'SHEL.L', 'LON', 'GBP', 'Energy'),
  ('BP', ARRAY['BP', 'British Petroleum'], 'BP.L', 'LON', 'GBP', 'Energy'),
  ('Rio Tinto', ARRAY['Rio Tinto'], 'RIO.L', 'LON', 'GBP', 'Materials'),
  ('BHP Group', ARRAY['BHP', 'BHP Group'], 'BHP.L', 'LON', 'GBP', 'Materials'),
  ('Novo Holdings', ARRAY['Novo Holdings'], NULL, NULL, 'DKK', 'Financials'),
  ('Saxo Bank', ARRAY['Saxo Bank', 'Saxo'], NULL, NULL, 'DKK', 'Financials')
ON CONFLICT DO NOTHING;

-- Also update existing US stocks to have exchange set
UPDATE stock_tickers SET exchange = 'NYSE' WHERE ticker_nyse IS NOT NULL AND exchange IS NULL;
UPDATE stock_tickers SET exchange = 'NASDAQ' WHERE ticker_primary IN ('NVDA', 'AMZN', 'GOOGL', 'TSLA', 'META') AND exchange IS NULL;
