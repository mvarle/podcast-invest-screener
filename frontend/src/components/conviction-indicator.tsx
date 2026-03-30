import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const LEVELS = {
  strong: {
    bars: 3,
    label: "Strong call",
    color: "bg-emerald-500",
    tooltip:
      "The speaker expressed a clear, confident opinion on this stock with specific reasoning.",
  },
  moderate: {
    bars: 2,
    label: "Moderate call",
    color: "bg-amber-500",
    tooltip:
      "The speaker expressed an opinion with some reservations or conditions.",
  },
  tentative: {
    bars: 1,
    label: "Tentative mention",
    color: "bg-zinc-400",
    tooltip:
      "The speaker mentioned this stock with interest but did not take a firm position.",
  },
} as const;

export function ConvictionIndicator({
  conviction,
}: {
  conviction: "strong" | "moderate" | "tentative" | null;
}) {
  if (!conviction) return null;

  const level = LEVELS[conviction];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center gap-1.5">
            <div className="flex items-end gap-0.5 h-3.5">
              {[1, 2, 3].map((bar) => (
                <div
                  key={bar}
                  className={`w-1 rounded-sm ${
                    bar <= level.bars ? level.color : "bg-muted"
                  }`}
                  style={{ height: `${(bar / 3) * 100}%` }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{level.label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs max-w-48">{level.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
