import { Sidebar } from "@/components/layout/Sidebar";
import { TopicCardSkeletonList } from "@/components/forum/TopicCardSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

// Route-level loading UI for the main forum segment. Next.js renders
// this automatically while the server component is fetching data, which
// makes the first paint feel fast even on a cold cache. Mirrors the
// layout of app/(main)/page.tsx so the hand-off doesn't reflow.
export default function MainLoading() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6">
      <Sidebar />
      <section className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-9 w-20" />
        </div>
        <TopicCardSkeletonList count={5} />
      </section>
      <aside className="hidden w-64 shrink-0 xl:block">
        <div className="sticky top-20 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="mb-2 h-4 w-24" />
            <Skeleton className="mb-1 h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      </aside>
    </main>
  );
}
