import Link from "next/link";
import { searchTopics } from "@/lib/api/search";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const { results } = q ? await searchTopics(q, 50) : { results: [] };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          首页
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-foreground">搜索</span>
      </nav>

      <h1 className="mb-2 text-2xl font-bold text-foreground">搜索</h1>

      <form className="mb-6" action="/search">
        <div className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="搜索主题标题…"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            搜索
          </button>
        </div>
      </form>

      {q && (
        <p className="mb-4 text-xs text-muted-foreground">
          关键词「<span className="font-mono text-foreground">{q}</span>」找到 {results.length} 个结果
        </p>
      )}

      {q && results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          没有找到匹配的主题
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          输入关键词开始搜索
        </div>
      ) : (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.id}>
              <Link
                href={`/topic/${r.id}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition hover:border-foreground/20"
              >
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 font-medium text-foreground">{r.title}</div>
                  {r.category_slug && (
                    <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                      /{r.category_slug}
                    </div>
                  )}
                </div>
                <span className="ml-3 shrink-0 font-mono text-[11px] text-muted-foreground">
                  💬 {r.reply_count}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
