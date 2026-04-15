import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { CategoryRulesCard } from "@/components/forum/CategoryRulesCard";
import { TopicCard } from "@/components/forum/TopicCard";
import { fetchCategory, fetchTopics } from "@/lib/api/forum-server";

const sortTabs = [
  { key: "hot", label: "热门" },
  { key: "latest", label: "最新" },
  { key: "top", label: "精选" },
];

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;

  const cat = await fetchCategory(category);
  if (!cat) notFound();

  const topics = await fetchTopics({ category, sort: "hot" });

  const isAnon = cat.type === "anon";
  const isBot = cat.type === "bot";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6">
      <Sidebar />

      <section className="min-w-0 flex-1">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            首页
          </Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground">{cat.name}</span>
        </nav>

        <header
          className={`mb-6 rounded-lg border p-5 ${
            isAnon
              ? "border-border bg-muted/40"
              : isBot
              ? "border-violet-500/30 bg-violet-500/5"
              : "border-border bg-card"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <h1 className="text-xl font-bold text-foreground">{cat.name}</h1>
                {isAnon && (
                  <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
                    匿名
                  </span>
                )}
                {isBot && (
                  <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-violet-500">
                    BOT 区
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{cat.description}</p>
              <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                <span>📝 {cat.topicCount} 帖子</span>
                {isAnon && <span>⚠ 前台匿名，后台可追溯</span>}
                {isBot && <span>🤖 Bot 可参与</span>}
              </div>
            </div>
            <Link
              href={`/new?category=${cat.slug}`}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              + 发帖
            </Link>
          </div>
        </header>

        {cat.rules && <CategoryRulesCard rules={cat.rules} />}

        <div className="mb-4 flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {sortTabs.map((tab, i) => (
            <button
              key={tab.key}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                i === 0
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {topics.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
            <div className="mb-2 text-4xl">📭</div>
            <p className="text-sm text-muted-foreground">这个板块还没有帖子</p>
            <Link
              href={`/new?category=${cat.slug}`}
              className="mt-4 inline-block rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              发第一个帖子
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {topics.map((t) => (
              <TopicCard key={t.id} topic={t} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
