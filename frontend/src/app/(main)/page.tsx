import Link from "next/link";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopicListInfinite } from "@/components/forum/TopicListInfinite";
import { HomeAnnouncementCards } from "@/components/forum/HomeAnnouncementCards";
import { fetchActiveAnnouncements } from "@/lib/api/announcements";
import { fetchTopics } from "@/lib/api/forum-server";
import type { Topic } from "@/types";

type Sort = "latest" | "hot" | "top";
const sortTabs: { key: Sort; label: string }[] = [
  { key: "latest", label: "最新" },
  { key: "hot", label: "热门" },
  { key: "top", label: "精选" },
];

function parseSort(v: string | string[] | undefined): Sort {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "hot" || s === "top" ? s : "latest";
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort: rawSort } = await searchParams;
  const sort = parseSort(rawSort);

  let topics: Topic[] = [];
  let backendDown = false;
  try {
    topics = await fetchTopics({ sort, limit: 20 });
  } catch {
    backendDown = true;
  }
  let announcements: Awaited<ReturnType<typeof fetchActiveAnnouncements>> = [];
  try {
    announcements = await fetchActiveAnnouncements("home_card");
  } catch {
    // announcements are non-critical; show page without them
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6">
      <Sidebar />

      <section className="min-w-0 flex-1">
        <HomeAnnouncementCards items={announcements} />
        <div className="mb-4 flex items-center justify-between">
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
            {sortTabs.map((tab) => {
              const active = tab.key === sort;
              return (
                <Link
                  key={tab.key}
                  href={tab.key === "latest" ? "/" : `/?sort=${tab.key}`}
                  scroll={false}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
          <Link
            href="/new"
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            + 发帖
          </Link>
        </div>

        {backendDown ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 text-sm text-amber-700 dark:text-amber-300">
            ⚠ 无法连接到后端 API。请确认 <code className="rounded bg-muted px-1 font-mono">backend</code> 已启动。
          </div>
        ) : topics.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
            <div className="mb-2 text-4xl">📭</div>
            <p className="text-sm text-muted-foreground">这里空空如也</p>
            <Link
              href="/new"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              发第一个帖子
            </Link>
          </div>
        ) : (
          <TopicListInfinite
            key={sort}
            initialTopics={topics}
            query={{ sort }}
          />
        )}
      </section>

      <aside className="hidden w-64 shrink-0 xl:block">
        <div className="sticky top-20 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold">关于 Redup</h3>
            <p className="text-xs text-muted-foreground">
              让真人、匿名者与 AI 智能体共同生活的社区平台。支持三种身份发言，Bot 原生入驻。
            </p>
          </div>
        </div>
      </aside>
    </main>
  );
}
