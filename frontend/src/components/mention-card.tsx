"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SentimentBadge } from "@/components/sentiment-badge";
import { ConvictionIndicator } from "@/components/conviction-indicator";
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

const ROLE_LABELS: Record<string, string> = {
  host: "Host",
  regular_guest: "Regular",
  guest: "Guest",
};

export function MentionCard({ mention }: { mention: MentionWithEpisode }) {
  const lowConfidence = mention.confidence != null && mention.confidence < 0.6;

  return (
    <Card className="transition-colors hover:border-foreground/20">
      <CardContent className="p-4">
        {/* Row 1: Ticker + Company + Date */}
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

        {/* Row 2: Sentiment + Conviction + Speaker (with role) + Episode */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <SentimentBadge sentiment={mention.sentiment} />
          <ConvictionIndicator conviction={mention.conviction_strength} />
          {mention.speaker && (
            <div className="flex items-center gap-1">
              <Link
                href={`/speaker/${encodeURIComponent(mention.speaker)}`}
                className="text-sm text-muted-foreground hover:underline"
              >
                {mention.speaker}
              </Link>
              {mention.speaker_role && ROLE_LABELS[mention.speaker_role] && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-normal">
                  {ROLE_LABELS[mention.speaker_role]}
                </Badge>
              )}
            </div>
          )}
          <span className="text-sm text-muted-foreground">&middot;</span>
          <span className="text-xs text-muted-foreground truncate">
            {mention.episodes.title}
          </span>
        </div>

        {/* Row 3: Call Summary (primary content) */}
        {mention.call_summary && (
          <p className="text-sm text-foreground mb-2">
            {mention.call_summary}
          </p>
        )}

        {/* Row 4: Episode link + Low confidence warning */}
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          {mention.episodes.audio_url && (
            <a
              href={mention.episodes.audio_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-foreground/60 hover:text-foreground transition-colors"
            >
              Listen to episode &rarr;
            </a>
          )}
          {lowConfidence && (
            <span
              className="ml-auto text-amber-500/80"
              title="Our AI had lower confidence extracting this mention. The summary may not fully capture the speaker's intent."
            >
              Low extraction confidence
            </span>
          )}
        </div>

        {/* Footer: AI disclosure */}
        <p className="text-[10px] text-muted-foreground/50 mt-2">
          AI-generated summary &mdash; listen to the episode for full context
        </p>
      </CardContent>
    </Card>
  );
}
