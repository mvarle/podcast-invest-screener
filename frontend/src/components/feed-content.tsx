"use client";

import { useState } from "react";
import { MentionCard } from "@/components/mention-card";
import { FeedFilters } from "@/components/feed-filters";
import type { MentionWithEpisode } from "@/types/database";

type Sentiment = "bullish" | "bearish" | "hold";
type Conviction = "strong" | "moderate" | "tentative";

export function FeedContent({ mentions }: { mentions: MentionWithEpisode[] }) {
  const [convictionFilter, setConvictionFilter] = useState<Set<Conviction>>(
    new Set(["strong", "moderate"])
  );
  const [activeSentiments, setActiveSentiments] = useState<Sentiment[]>([
    "bullish",
    "bearish",
    "hold",
  ]);

  const filtered = mentions.filter(
    (m) =>
      activeSentiments.includes(m.sentiment) &&
      (m.conviction_strength
        ? convictionFilter.has(m.conviction_strength)
        : convictionFilter.has("tentative"))
  );

  return (
    <>
      <FeedFilters
        convictionFilter={convictionFilter}
        onConvictionChange={setConvictionFilter}
        activeSentiments={activeSentiments}
        onSentimentChange={setActiveSentiments}
        filteredCount={filtered.length}
        totalCount={mentions.length}
      />

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg mb-2">No mentions match this filter</p>
          <p className="text-sm">
            Try adjusting the conviction or sentiment filters.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((mention) => (
            <MentionCard key={mention.id} mention={mention} />
          ))}
        </div>
      )}
    </>
  );
}
