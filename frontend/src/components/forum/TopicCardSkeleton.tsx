import { Skeleton } from "@/components/ui/Skeleton";

// Mirrors the real TopicCard compact row so the hand-off is invisible.
export function TopicCardSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <Skeleton className="mb-1.5 h-4 w-3/4" />
        <div className="flex gap-1.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-10" />
        </div>
      </div>
      <Skeleton className="h-10 w-12 rounded-md" />
    </div>
  );
}

// Convenience wrapper — keeps list chrome consistent with TopicCard.
export function TopicCardSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {Array.from({ length: count }).map((_, i) => (
        <TopicCardSkeleton key={i} />
      ))}
    </div>
  );
}
