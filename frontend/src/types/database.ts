export type Database = {
  public: {
    Tables: {
      podcasts: {
        Row: {
          id: string;
          name: string;
          rss_feed_url: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
        };
      };
      episodes: {
        Row: {
          id: string;
          podcast_id: string;
          title: string;
          release_date: string;
          episode_guid: string;
          audio_url: string;
          status: string;
          error_message: string | null;
          retry_count: number;
          next_retry_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      transcripts: {
        Row: {
          id: string;
          episode_id: string;
          content: string;
          word_count: number | null;
          language: string;
          created_at: string;
        };
      };
      stock_mentions: {
        Row: {
          id: string;
          episode_id: string;
          ticker: string | null;
          company_name: string;
          exchange: string | null;
          sentiment: "bullish" | "bearish" | "hold";
          mention_type:
            | "investment_call"
            | "comparison"
            | "passing_mention"
            | "news_reference";
          confidence: number | null;
          conviction_strength: "strong" | "moderate" | "tentative" | null;
          speaker: string | null;
          speaker_role: "host" | "regular_guest" | "guest" | null;
          timestamp_in_transcript: string | null;
          call_summary: string | null;
          baseline_price: number | null;
          baseline_price_date: string | null;
          created_at: string;
        };
      };
      performance_snapshots: {
        Row: {
          id: string;
          mention_id: string;
          snapshot_type: "1d" | "1w" | "1m" | "3m" | "6m" | "1y";
          snapshot_date: string;
          closing_price: number;
          price_change_percent: number | null;
          prediction_correct: boolean | null;
          created_at: string;
        };
      };
      stock_tickers: {
        Row: {
          id: string;
          company_name: string;
          common_names: string[];
          ticker_copenhagen: string | null;
          ticker_nyse: string | null;
          ticker_primary: string | null;
          exchange: string | null;
          isin: string | null;
          currency: string;
          sector: string | null;
          is_active: boolean;
          created_at: string;
        };
      };
      users: {
        Row: {
          id: string;
          email: string | null;
          user_type: "free" | "paid";
          created_at: string;
        };
      };
    };
  };
};

// Convenience types
export type Podcast = Database["public"]["Tables"]["podcasts"]["Row"];
export type Episode = Database["public"]["Tables"]["episodes"]["Row"];
export type StockMention = Database["public"]["Tables"]["stock_mentions"]["Row"];
export type PerformanceSnapshot =
  Database["public"]["Tables"]["performance_snapshots"]["Row"];
export type StockTicker = Database["public"]["Tables"]["stock_tickers"]["Row"];

// Joined types for the feed
export type MentionWithEpisode = StockMention & {
  episodes: Pick<Episode, "title" | "release_date" | "podcast_id" | "audio_url"> & {
    podcasts: Pick<Podcast, "name">;
  };
};
