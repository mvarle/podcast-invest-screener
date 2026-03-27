-- PodSignal Database Schema

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Podcasts table
create table podcasts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  rss_feed_url text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Episodes table
create table episodes (
  id uuid primary key default uuid_generate_v4(),
  podcast_id uuid not null references podcasts(id) on delete cascade,
  title text not null,
  release_date timestamptz,
  episode_guid text unique not null,
  audio_url text not null,
  storage_path text,
  transcript text,
  status text not null default 'pending_transcription'
    check (status in ('pending_transcription', 'transcription_complete', 'analysis_complete', 'error')),
  error_message text,
  created_at timestamptz default now()
);

-- Stock mentions table
create table stock_mentions (
  id uuid primary key default uuid_generate_v4(),
  episode_id uuid not null references episodes(id) on delete cascade,
  ticker text not null,
  company_name text not null,
  sentiment text not null
    check (sentiment in ('bullish', 'bearish', 'hold')),
  speaker text,
  timestamp_in_transcript text,
  quote text not null,
  reasoning text,
  baseline_price numeric,
  baseline_price_date date,
  created_at timestamptz default now()
);

-- Performance snapshots table
create table performance_snapshots (
  id uuid primary key default uuid_generate_v4(),
  mention_id uuid not null references stock_mentions(id) on delete cascade,
  snapshot_type text not null
    check (snapshot_type in ('1d', '1w', '1m', '3m', '6m', '1y')),
  snapshot_date date not null,
  closing_price numeric not null,
  price_change_percent numeric,
  prediction_correct boolean,
  created_at timestamptz default now(),
  unique (mention_id, snapshot_type)
);

-- Users table (extends Supabase Auth)
create table users (
  id uuid primary key,  -- matches Supabase Auth user ID
  email text not null,
  user_type text not null default 'free'
    check (user_type in ('free', 'paid')),
  created_at timestamptz default now()
);

-- Indexes for common queries
create index idx_episodes_podcast_id on episodes(podcast_id);
create index idx_episodes_status on episodes(status);
create index idx_episodes_release_date on episodes(release_date desc);
create index idx_stock_mentions_episode_id on stock_mentions(episode_id);
create index idx_stock_mentions_ticker on stock_mentions(ticker);
create index idx_stock_mentions_speaker on stock_mentions(speaker);
create index idx_stock_mentions_sentiment on stock_mentions(sentiment);
create index idx_stock_mentions_created_at on stock_mentions(created_at desc);
create index idx_performance_snapshots_mention_id on performance_snapshots(mention_id);

-- Row Level Security
alter table podcasts enable row level security;
alter table episodes enable row level security;
alter table stock_mentions enable row level security;
alter table performance_snapshots enable row level security;
alter table users enable row level security;

-- Public read access policies (all content visible for MVP)
create policy "Public read access" on podcasts for select using (true);
create policy "Public read access" on episodes for select using (true);
create policy "Public read access" on stock_mentions for select using (true);
create policy "Public read access" on performance_snapshots for select using (true);

-- Users can read their own profile
create policy "Users read own profile" on users for select using (auth.uid() = id);
create policy "Users update own profile" on users for update using (auth.uid() = id);

-- Service role can do everything (for Edge Functions)
create policy "Service role full access" on podcasts for all using (auth.role() = 'service_role');
create policy "Service role full access" on episodes for all using (auth.role() = 'service_role');
create policy "Service role full access" on stock_mentions for all using (auth.role() = 'service_role');
create policy "Service role full access" on performance_snapshots for all using (auth.role() = 'service_role');
create policy "Service role full access" on users for all using (auth.role() = 'service_role');

-- Function to auto-create user profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
