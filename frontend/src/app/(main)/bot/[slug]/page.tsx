import Link from "next/link";
import { notFound } from "next/navigation";
import { BotTokenPanel } from "@/components/bot/BotTokenPanel";
import { adaptBot, fetchBotBySlug } from "@/lib/api/bot";

export default async function BotProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const server = await fetchBotBySlug(slug);

  if (!server) notFound();

  const bot = adaptBot(server);
  const isPending = server.status === "pending";
  const isSuspended = server.status === "suspended";
  const isRejected = server.status === "rejected";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          首页
        </Link>
        <span className="mx-1.5">›</span>
        <Link href="/bot" className="hover:text-foreground">
          Bot 区
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-foreground">{bot.name}</span>
      </nav>

      {(isPending || isSuspended || isRejected) && (
        <div
          className={`mb-4 rounded-md border px-3 py-2 text-xs ${
            isPending
              ? "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
              : isSuspended
              ? "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300"
              : "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300"
          }`}
        >
          {isPending && "⏳ 该 Bot 正在审核中，仅你和管理员可见"}
          {isSuspended && `⛔ 该 Bot 已被暂停${server.rejection_note ? "：" + server.rejection_note : ""}`}
          {isRejected && `❌ 该 Bot 已被驳回${server.rejection_note ? "：" + server.rejection_note : ""}`}
        </div>
      )}

      <section className="relative mb-8 overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-background p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />

        <div className="relative flex flex-col gap-6 md:flex-row md:items-start">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-violet-600 text-5xl text-white shadow-md">
            ⚡
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{bot.name}</h1>
              <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                BOT
              </span>
              {bot.isOfficial && (
                <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                  官方
                </span>
              )}
              {bot.isFeatured && !bot.isOfficial && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  精选
                </span>
              )}
              <span className="ml-auto font-mono text-xs text-muted-foreground">@{bot.slug}</span>
            </div>

            <p className="mb-4 text-sm text-muted-foreground">{bot.description}</p>

            {bot.tags && bot.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {bot.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-violet-500/15 px-2 py-0.5 text-xs text-violet-600 dark:text-violet-400"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                disabled
                title="Phase 2：让 Bot 主动回复某个帖子"
                className="rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-1.5 text-sm font-semibold text-white opacity-50 shadow-sm"
              >
                + 召唤到帖子
              </button>
              <button
                disabled
                className="rounded-md border border-violet-500/30 bg-card px-4 py-1.5 text-sm font-medium text-violet-600 opacity-50 dark:text-violet-400"
              >
                ⭐ 订阅
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8 grid gap-3 sm:grid-cols-4">
        <MetaCard label="模型提供方" value={server.model_provider} />
        <MetaCard label="模型" value={server.model_name} mono />
        <MetaCard label="创建者" value={`@${bot.ownerUsername}`} />
        <MetaCard label="累计调用" value={bot.callCount.toLocaleString()} />
      </section>

      <BotTokenPanel botSlug={server.slug} ownerUsername={bot.ownerUsername} />

      {server.system_prompt && (
        <section className="mb-8 rounded-xl border border-border bg-card p-5">
          <h2 className="mb-2 text-sm font-semibold text-foreground">System Prompt</h2>
          <pre className="whitespace-pre-wrap rounded bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
            {server.system_prompt}
          </pre>
        </section>
      )}

      <section className="mb-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">使用方式</h2>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div>
            <span className="text-foreground">被 @ 召唤：</span>
            在任何允许 Bot 的帖子里输入{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              @{bot.slug}
            </code>{" "}
            即可触发回复（Phase 2 启用）。
          </div>
          <div>
            <span className="text-foreground">限制：</span>不能进入匿名区，点赞不计入排序权重。
          </div>
        </div>
      </section>
    </main>
  );
}

function MetaCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-semibold text-foreground ${mono ? "font-mono text-sm" : ""}`}>
        {value}
      </div>
    </div>
  );
}
