import Link from "next/link";
import { AnonThreadRow } from "@/components/anon/AnonThreadRow";
import { fetchCategories, fetchTopics } from "@/lib/api/forum-server";
import type { Category, Topic } from "@/types";

// SSR: server-render the anon hub with live data. Both sub-queries run in
// parallel so the page is one round-trip per request. If the backend is
// unreachable we gracefully degrade to empty sections rather than 500 —
// the anon hub is a public entry point and should still render the banner
// and rules even when data loading fails.
export default async function AnonHubPage() {
  let anonCategories: Category[] = [];
  let threads: Topic[] = [];
  let backendDown = false;
  try {
    const [cats, topics] = await Promise.all([
      fetchCategories(),
      fetchTopics({ type: "anon", sort: "latest", limit: 30 }),
    ]);
    anonCategories = cats.filter((c) => c.type === "anon");
    threads = topics.filter((t) => t.author.type === "anon");
  } catch {
    backendDown = true;
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <section className="mb-6 border border-foreground bg-muted/40">
        <div className="border-b border-foreground bg-foreground px-4 py-2">
          <div className="flex items-baseline gap-3">
            <h1 className="font-mono text-sm font-bold tracking-widest text-background">
              /ANON/
            </h1>
            <span className="font-mono text-[11px] text-background/60">匿名区</span>
          </div>
        </div>
        <div className="px-4 py-4">
          <p className="mb-3 text-sm leading-relaxed text-foreground">
            这里是 Redup 的匿名板块。在同一个串内你的身份固定，到了别的串会换一个新身份。
            你对其他用户匿名，但平台可追溯你的真实账号用于审核。
          </p>
          <div className="border-l-2 border-foreground bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <div>· 请遵守社区规则，禁止人身攻击、色情擦边、引战钓鱼</div>
            <div>· 新账号、低信用账号暂无法进入匿名区</div>
            <div>· 所有发言记录日志，违规将追溯处理</div>
          </div>
        </div>
      </section>

      {backendDown && (
        <div className="mb-6 rounded border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">
          ⚠ 无法连接后端 API，暂时无法加载版面和最新串。
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          &gt;&gt; 版面
        </h2>
        {anonCategories.length === 0 ? (
          <div className="border border-dashed border-border bg-card px-4 py-6 text-center font-mono text-[11px] text-muted-foreground">
            还没有匿名版面
          </div>
        ) : (
          <div className="border border-border bg-card">
            {anonCategories.map((c, i) => (
              <Link
                key={c.id}
                href={`/${c.slug}`}
                className={`flex items-center justify-between px-4 py-3 transition hover:bg-accent ${
                  i < anonCategories.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div>
                  <div className="font-serif text-base text-foreground">[{c.name}]</div>
                  <div className="text-xs text-muted-foreground">{c.description}</div>
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {c.topicCount} 串
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-end justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            &gt;&gt; 最新串
          </h2>
          <Link
            href="/new?anon=1"
            className="font-mono text-[11px] text-foreground underline underline-offset-2 hover:opacity-70"
          >
            [ 发串 ]
          </Link>
        </div>

        {threads.length === 0 ? (
          <div className="border border-dashed border-border bg-card px-4 py-8 text-center font-mono text-[11px] text-muted-foreground">
            还没有匿名串
          </div>
        ) : (
          <div className="border border-border bg-card">
            {threads.map((t) => (
              <AnonThreadRow key={t.id} topic={t} />
            ))}
          </div>
        )}

        <div className="mt-4 text-center font-mono text-[11px] text-muted-foreground">
          — 到底了 —
        </div>
      </section>
    </main>
  );
}
