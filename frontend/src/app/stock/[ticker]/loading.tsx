import { Skeleton } from "@/components/ui/skeleton";
import { MentionCardSkeleton } from "@/components/mention-card-skeleton";

export default function StockDetailLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-6 w-40" />
        </div>
        <Skeleton className="h-4 w-48 mt-1" />
      </div>
      <Skeleton className="h-12 w-full mb-6 rounded-lg" />
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <MentionCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
