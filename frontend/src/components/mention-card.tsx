"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { SentimentBadge } from "@/components/sentiment-badge";
import type { MentionWithEpisode } from "@/types/database";

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 30) return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return "just now";
}

export function MentionCard({ mention }: { mention: MentionWithEpisode }) {
  const [showContext, setShowContext] = useState(false);
  const hasContext = !!mention.transcript_context;

  return (
    <Card className="transition-colors hover:border-foreground/20">
      <CardContent className="p-4">
        {/* Row 1: Ticker + Sentiment + Date */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/stock/${mention.ticker || mention.company_name}`}
              className="font-mono font-bold text-base hover:underline"
            >
              {mention.ticker || mention.company_name}
            </Link>
            {mention.ticker && (
              <span className="text-sm text-muted-foreground">
                {mention.company_name}
              </span>
            )}
          </div>
          <span
            className="text-xs text-muted-foreground shrink-0"
            title={new Date(mention.episodes.release_date).toLocaleString()}
          >
            {timeAgo(mention.episodes.release_date)}
          </span>
        </div>

        {/* Row 2: Sentiment + Speaker + Episode */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <SentimentBadge sentiment={mention.sentiment} />
          {mention.speaker && (
            <Link
              href={`/speaker/${encodeURIComponent(mention.speaker)}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              {mention.speaker}
            </Link>
          )}
          <span className="text-sm text-muted-foreground">&middot;</span>
          <span className="text-xs text-muted-foreground truncate">
            {mention.episodes.title}
          </span>
        </div>

        {/* Row 3: Quote */}
        <blockquote className="text-sm text-muted-foreground border-l-2 border-muted pl-3 line-clamp-3">
          &ldquo;{mention.quote}&rdquo;
        </blockquote>

        {/* Row 4: Reasoning */}
        {mention.reasoning && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            {mention.reasoning}
          </p>
        )}

        {/* Row 5: Conviction + Confidence + Context toggle */}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          {mention.conviction_strength && (
            <span className="capitalize">
              {mention.conviction_strength} conviction
            </span>
          )}
          {mention.confidence != null && (
            <span>{Math.round(mention.confidence * 100)}% confidence</span>
          )}
          {hasContext && (
            <button
              onClick={() => setShowContext(!showContext)}
              className="ml-auto text-xs text-foreground/60 hover:text-foreground transition-colors"
            >
              {showContext ? "Hide context" : "Show context"}
            </button>
          )}
        </div>

        {/* Expandable transcript context */}
        {showContext && mention.transcript_context && (
          <div className="mt-3 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
            {mention.transcript_context}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
