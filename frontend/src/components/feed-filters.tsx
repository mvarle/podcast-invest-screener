"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const confidenceLevels = [0, 25, 50, 75] as const;

type Sentiment = "bullish" | "bearish" | "hold";

const sentimentConfig: Record<
  Sentiment,
  { label: string; activeClass: string }
> = {
  bullish: {
    label: "Bullish",
    activeClass:
      "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800",
  },
  bearish: {
    label: "Bearish",
    activeClass:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800",
  },
  hold: {
    label: "Hold",
    activeClass:
      "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800",
  },
};

interface FeedFiltersProps {
  minConfidence: number;
  onConfidenceChange: (value: number) => void;
  activeSentiments: Sentiment[];
  onSentimentChange: (sentiments: Sentiment[]) => void;
  filteredCount: number;
  totalCount: number;
}

export function FeedFilters({
  minConfidence,
  onConfidenceChange,
  activeSentiments,
  onSentimentChange,
  filteredCount,
  totalCount,
}: FeedFiltersProps) {
  function toggleSentiment(sentiment: Sentiment) {
    if (activeSentiments.includes(sentiment)) {
      // Don't allow deselecting all
      if (activeSentiments.length === 1) return;
      onSentimentChange(activeSentiments.filter((s) => s !== sentiment));
    } else {
      onSentimentChange([...activeSentiments, sentiment]);
    }
  }

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border bg-card flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium whitespace-nowrap">
          Min confidence
        </span>
        <div className="flex items-center gap-1">
          {confidenceLevels.map((level) => (
            <button
              key={level}
              onClick={() => onConfidenceChange(level)}
              className={cn(
                "px-2 py-0.5 text-xs rounded-md border transition-colors",
                minConfidence === level
                  ? "bg-foreground text-background border-foreground"
                  : "bg-transparent text-muted-foreground border-border hover:border-foreground/40"
              )}
            >
              {level === 0 ? "All" : `${level}%+`}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {(Object.keys(sentimentConfig) as Sentiment[]).map((sentiment) => {
          const isActive = activeSentiments.includes(sentiment);
          const config = sentimentConfig[sentiment];
          return (
            <button key={sentiment} onClick={() => toggleSentiment(sentiment)}>
              <Badge
                variant="outline"
                className={cn(
                  "cursor-pointer transition-colors",
                  isActive
                    ? config.activeClass
                    : "opacity-40 hover:opacity-70"
                )}
              >
                {config.label}
              </Badge>
            </button>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
        {filteredCount} of {totalCount} mentions
      </span>
    </div>
  );
}
