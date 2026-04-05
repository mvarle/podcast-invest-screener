"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Conviction = "strong" | "moderate" | "tentative";
type Sentiment = "bullish" | "bearish" | "hold";

const convictionOptions: { value: Conviction | "all"; label: string }[] = [
  { value: "strong", label: "Strong" },
  { value: "moderate", label: "Moderate" },
  { value: "all", label: "All" },
];

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
  convictionFilter: Set<Conviction>;
  onConvictionChange: (filter: Set<Conviction>) => void;
  activeSentiments: Sentiment[];
  onSentimentChange: (sentiments: Sentiment[]) => void;
  filteredCount: number;
  totalCount: number;
}

export function FeedFilters({
  convictionFilter,
  onConvictionChange,
  activeSentiments,
  onSentimentChange,
  filteredCount,
  totalCount,
}: FeedFiltersProps) {
  function toggleSentiment(sentiment: Sentiment) {
    if (activeSentiments.includes(sentiment)) {
      if (activeSentiments.length === 1) return;
      onSentimentChange(activeSentiments.filter((s) => s !== sentiment));
    } else {
      onSentimentChange([...activeSentiments, sentiment]);
    }
  }

  function handleConvictionClick(value: Conviction | "all") {
    if (value === "all") {
      // Toggle between showing all and showing strong+moderate only
      if (convictionFilter.has("tentative")) {
        onConvictionChange(new Set<Conviction>(["strong", "moderate"]));
      } else {
        onConvictionChange(
          new Set<Conviction>(["strong", "moderate", "tentative"])
        );
      }
    } else {
      const next = new Set(convictionFilter);
      if (next.has(value)) {
        if (next.size > 1) next.delete(value);
      } else {
        next.add(value);
      }
      onConvictionChange(next);
    }
  }

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border bg-card flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium whitespace-nowrap">
          Conviction
        </span>
        <div className="flex items-center gap-1">
          {convictionOptions.map((opt) => {
            const isActive =
              opt.value === "all"
                ? convictionFilter.has("tentative")
                : convictionFilter.has(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => handleConvictionClick(opt.value)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded-md border transition-colors",
                  isActive
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent text-muted-foreground border-border hover:border-foreground/40"
                )}
              >
                {opt.label}
              </button>
            );
          })}
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
        {filteredCount} of {totalCount} calls
      </span>
    </div>
  );
}
