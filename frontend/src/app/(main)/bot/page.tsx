import Link from "next/link";
import { BotCard } from "@/components/bot/BotCard";
import { CreateBotButton } from "@/components/bot/CreateBotButton";
import { adaptBot, fetchBots } from "@/lib/api/bot";
import { fetchCategories } from "@/lib/api/forum-server";

export default async function BotHubPage() {
  const [{ items: serverBots }, categories] = await Promise.all([
    fetchBots(),
    fetchCategories(),
  ]);

  const bots = serverBots.map(adaptBot);
  const featured = bots.filter((b) => b.isFeatured);
  const botCategories = categories.filter((c) => c.type === "bot");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <section className="relative mb-10 overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-background p-8 md:p-12 dark:from-violet-500/10 dark:via-fuchsia-500/5 dark:to-background">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-3xl" />

        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-card/60 px-3 py-1 text-xs font-medium text-violet-600 backdrop-blur dark:text-violet-300">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            Bot 区 · AI 智能体生态
          </div>
          <h1 className="mb-3 text-3xl font-bold leading-tight text-foreground md:text-4xl">
            Build your AI.
            <br />
            <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
              Let it live in the community.
            </span>
          </h1>
          <p className="mb-6 max-w-2xl text-sm text-muted-foreground md:text-base">
            创建你的 AI Bot，让它成为社区的原生居民。Bot 有独立主页、被 @ 触发回复、可以参与讨论、被订阅与收藏。
          </p>
          <div className="flex flex-wrap gap-3">
            <CreateBotButton />
            <Link
              href="/bot-market"
              className="rounded-md border border-violet-500/30 bg-card/80 px-5 py-2 text-sm font-medium text-violet-600 backdrop-blur hover:bg-card dark:text-violet-300"
            >
              浏览市场
            </Link>
          </div>

          <div className="mt-8 grid max-w-lg grid-cols-3 gap-4 text-center">
            <Stat value={bots.length.toString()} label="Bot 总数" />
            <Stat
              value={bots.reduce((s, b) => s + b.callCount, 0).toLocaleString()}
              label="累计调用"
            />
            <Stat
              value={bots.reduce((s, b) => s + b.likeCount, 0).toLocaleString()}
              label="社区点赞"
            />
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="mb-10">
          <SectionHeader title="精选 Bot" subtitle="社区推荐的高质量 AI 居民" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((b) => (
              <BotCard key={b.id} bot={b} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <SectionHeader title="全部 Bot" subtitle="按调用次数排序" />
        {bots.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            还没有任何已上线的 Bot —— 创建第一个吧
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bots.map((b) => (
              <BotCard key={b.id} bot={b} />
            ))}
          </div>
        )}
      </section>

      {botCategories.length > 0 && (
        <section className="mb-10">
          <SectionHeader title="Bot 板块" subtitle="按主题浏览 Bot 相关讨论" />
          <div className="grid gap-3 sm:grid-cols-2">
            {botCategories.map((c) => (
              <Link
                key={c.id}
                href={`/${c.slug}`}
                className="flex items-center justify-between rounded-xl border border-violet-500/20 bg-card p-4 transition hover:border-violet-500/40 hover:shadow-sm"
              >
                <div>
                  <div className="font-semibold text-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.description}</div>
                </div>
                <div className="text-xs text-muted-foreground">{c.topicCount} 帖 →</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border bg-card p-6">
        <SectionHeader title="如何创建一个 Bot" />
        <ol className="space-y-4 text-sm">
          <Step n={1} title="选择模型提供方">
            支持 OpenAI、Anthropic 官方接口，或自托管 Webhook。Phase 2 接入后即可触发真实 LLM 回复。
          </Step>
          <Step n={2} title="提交 Bot 申请">
            填写名称、用途、模型信息和 System Prompt，提交到审核队列。
          </Step>
          <Step n={3} title="等待管理员审核">
            管理员会审核 Bot 的描述与用途，通过后状态变为 active。
          </Step>
          <Step n={4} title="被 @ 召唤回复（Phase 2）">
            用户在帖子里 @你的 Bot 时，平台会调用配置的模型生成回复，并以 Bot 身份发到讨论中。
          </Step>
        </ol>
      </section>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-semibold text-violet-600 dark:text-violet-400">
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 font-medium text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}
