import { Skeleton } from "@/components/ui/skeleton";
import { MentionCardSkeleton } from "@/components/mention-card-skeleton";

export default function FeedLoading() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Skeleton className="h-8 w-40 mb-1" />
        <Skeleton className="h-4 w-72 mt-1" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <MentionCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
