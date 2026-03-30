"use client";

import { useState } from "react";
import { MentionCard } from "@/components/mention-card";
import { FeedFilters } from "@/components/feed-filters";
import type { MentionWithEpisode } from "@/types/database";

type Sentiment = "bullish" | "bearish" | "hold";

export function FeedContent({ mentions }: { mentions: MentionWithEpisode[] }) {
  const [minConfidence, setMinConfidence] = useState(0);
  const [activeSentiments, setActiveSentiments] = useState<Sentiment[]>([
    "bullish",
    "bearish",
    "hold",
  ]);

  const filtered = mentions.filter(
    (m) =>
      (m.confidence ?? 0) * 100 >= minConfidence &&
      activeSentiments.includes(m.sentiment)
  );

  return (
    <>
      <FeedFilters
        minConfidence={minConfidence}
        onConfidenceChange={setMinConfidence}
        activeSentiments={activeSentiments}
        onSentimentChange={setActiveSentiments}
        filteredCount={filtered.length}
        totalCount={mentions.length}
      />

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg mb-2">No mentions match this filter</p>
          <p className="text-sm">
            Try adjusting the confidence or sentiment filters.
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
