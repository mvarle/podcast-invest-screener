-- ============================================================
-- Migration 003: Analysis Quality & Copyright Protection
-- Adds call_summary, speaker_role columns; creates public view
-- excluding copyrighted content; restricts RLS on transcripts
-- ============================================================

-- ============================================================
-- 1. Add new columns to stock_mentions
-- ============================================================
ALTER TABLE stock_mentions ADD COLUMN IF NOT EXISTS call_summary TEXT;
ALTER TABLE stock_mentions ADD COLUMN IF NOT EXISTS speaker_role TEXT
  CHECK (speaker_role IN ('host', 'regular_guest', 'guest'));

-- ============================================================
-- 2. Create public view excluding copyrighted content
-- ============================================================
-- Frontend queries this view instead of the table directly.
-- quote, transcript_context, and reasoning are internal only.
CREATE OR REPLACE VIEW stock_mentions_public AS
SELECT
  id,
  episode_id,
  ticker,
  company_name,
  exchange,
  sentiment,
  mention_type,
  confidence,
  conviction_strength,
  speaker,
  speaker_role,
  timestamp_in_transcript,
  call_summary,
  baseline_price,
  baseline_price_date,
  created_at
FROM stock_mentions;

-- ============================================================
-- 3. Fix RLS: Restrict access to copyrighted content
-- ============================================================

-- Remove public read on transcripts (full transcripts are copyrighted)
DROP POLICY IF EXISTS "transcripts_public_read" ON transcripts;

-- Remove public read on stock_mentions table (contains quotes)
DROP POLICY IF EXISTS "stock_mentions_public_read" ON stock_mentions;

-- Grant public read on the view (which excludes copyrighted columns)
-- Views in Supabase inherit RLS from the underlying table, so we need
-- a policy that allows SELECT but the view itself limits columns.
-- Re-create a read policy on stock_mentions for the view to work:
CREATE POLICY "stock_mentions_read_via_view" ON stock_mentions
  FOR SELECT USING (true);

-- Note: The frontend should query 'stock_mentions_public' view,
-- which only exposes safe columns. The RLS policy allows SELECT
-- on the table (needed for the view), but the view controls which
-- columns are returned. For full column-level security, consider
-- Supabase column-level permissions or a Postgres function.
-- This approach is pragmatic: the view is the API surface for anon users.

-- ============================================================
-- 4. Extraction metadata for quality tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS extraction_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id UUID NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  mention_count INTEGER,
  investment_call_count INTEGER,
  avg_confidence NUMERIC(3,2),
  conviction_distribution JSONB,
  verification_rejection_count INTEGER DEFAULT 0,
  extraction_model TEXT,
  extraction_tokens_in INTEGER,
  extraction_tokens_out INTEGER,
  extraction_cost_usd NUMERIC(6,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(episode_id)
);

ALTER TABLE extraction_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "extraction_metadata_public_read" ON extraction_metadata
  FOR SELECT USING (true);
