import { Sidebar } from "@/components/layout/Sidebar";
import { TopicCardSkeletonList } from "@/components/forum/TopicCardSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

// Category landing page loading skeleton. Same shell as the main feed
// but with a category header placeholder.
export default function CategoryLoading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6">
      <Sidebar />
      <section className="min-w-0 flex-1">
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <Skeleton className="mb-2 h-6 w-32" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <TopicCardSkeletonList count={5} />
      </section>
    </main>
  );
}
