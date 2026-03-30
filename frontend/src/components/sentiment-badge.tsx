import { Badge } from "@/components/ui/badge";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

type Sentiment = "bullish" | "bearish" | "hold";

const config: Record<
  Sentiment,
  { label: string; className: string; icon: typeof ArrowUp }
> = {
  bullish: {
    label: "Bullish",
    className:
      "bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-950 dark:text-green-400 dark:border-green-800",
    icon: ArrowUp,
  },
  bearish: {
    label: "Bearish",
    className:
      "bg-red-50 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-950 dark:text-red-400 dark:border-red-800",
    icon: ArrowDown,
  },
  hold: {
    label: "Hold",
    className:
      "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-400 dark:border-yellow-800",
    icon: Minus,
  },
};

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const { label, className, icon: Icon } = config[sentiment];
  return (
    <Badge variant="outline" className={className}>
      <Icon className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  );
}
