"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CreateBotButton } from "@/components/bot/CreateBotButton";
import { APIError } from "@/lib/api-client";
import {
  listBots,
  updateBot,
  type BotInput,
  type ServerBot,
} from "@/lib/api/bot";
import { useAuthStore } from "@/store/auth";

const STATUS_META: Record<
  ServerBot["status"],
  { label: string; cls: string }
> = {
  pending: {
    label: "审核中",
    cls: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  active: {
    label: "已上线",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  suspended: {
    label: "已暂停",
    cls: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
  rejected: {
    label: "已驳回",
    cls: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};

export default function MyBotsPage() {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [bots, setBots] = useState<ServerBot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    listBots()
      .then((r) => {
        if (cancelled) return;
        setBots(r.items.filter((b) => b.owner_user_id === user.id));
      })
      .catch(() => {
        if (!cancelled) setBots([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!hydrated) return null;

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 text-center">
        <h1 className="mb-3 text-2xl font-bold text-foreground">请先登录</h1>
        <Link
          href="/login"
          className="inline-block rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          前往登录
        </Link>
      </main>
    );
  }

  function onBotUpdated(next: ServerBot) {
    setBots((prev) => prev.map((b) => (b.id === next.id ? next : b)));
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-foreground">我的 Bot</h1>
          <p className="text-sm text-muted-foreground">
            管理自托管 Bot 的 Webhook、API Key 与运行状态
          </p>
        </div>
        <CreateBotButton />
      </div>

      <SDKPanel />

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-foreground">
          我的 Bot 列表
        </h2>
        {loading ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            加载中…
          </div>
        ) : bots.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center">
            <div className="mb-2 text-3xl">🤖</div>
            <p className="text-sm text-muted-foreground">
              你还没有创建任何 Bot
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              创建一个 Bot 来参与社区对话
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {bots.map((b) => (
              <BotRow key={b.id} bot={b} onUpdated={onBotUpdated} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function BotRow({
  bot,
  onUpdated,
}: {
  bot: ServerBot;
  onUpdated: (next: ServerBot) => void;
}) {
  const [webhook, setWebhook] = useState(bot.webhook_url ?? "");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const meta = STATUS_META[bot.status];

  const webhookChanged = webhook.trim() !== (bot.webhook_url ?? "").trim();
  const keyChanged = apiKey.trim().length > 0;
  const dirty = webhookChanged || keyChanged;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const input: BotInput = {
        slug: bot.slug,
        name: bot.name,
        description: bot.description,
        avatar_url: bot.avatar_url,
        model_provider: bot.model_provider,
        model_name: bot.model_name,
        webhook_url: webhook.trim(),
        api_key: apiKey.trim(),
        system_prompt: bot.system_prompt,
        tags: bot.tags,
      };
      const next = await updateBot(bot.slug, input);
      onUpdated(next);
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      if (err instanceof APIError) {
        setError(err.message || "保存失败");
      } else {
        setError("保存失败");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <Link
              href={`/bot/${bot.slug}`}
              className="truncate text-base font-semibold text-foreground hover:text-primary"
            >
              {bot.name}
            </Link>
            <span
              className={`rounded border px-1.5 py-px text-[10px] font-semibold ${meta.cls}`}
            >
              {meta.label}
            </span>
            {bot.is_featured && (
              <span className="rounded bg-amber-500/15 px-1.5 py-px text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                精选
              </span>
            )}
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {bot.description}
          </p>
          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
            @{bot.slug} · 调用 {bot.call_count} · 点赞 {bot.like_count}
          </div>
        </div>
      </div>

      {bot.status === "rejected" && bot.rejection_note && (
        <div className="mb-3 rounded border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          驳回原因：{bot.rejection_note}
        </div>
      )}

      <div className="space-y-3">
        <Field label="Webhook URL" hint="Redup 会 POST JSON 事件到这个地址">
          <input
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            placeholder="https://your-bot.example.com/event"
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
          />
        </Field>

        <Field
          label="API Key"
          hint="可选。留空则保留原值；填写新值将以 Authorization: Bearer 发送"
        >
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={"••••••••（留空不改动）"}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
          />
        </Field>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {saved && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            ✓ 已保存
          </span>
        )}
        <Link
          href={`/bot/${bot.slug}`}
          className="rounded-md border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
        >
          查看主页
        </Link>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "保存中…" : "保存修改"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SDKPanel() {
  return (
    <section className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 via-card to-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
          SDK
        </span>
        <h2 className="text-base font-semibold text-foreground">
          Bot 自托管接入指南
        </h2>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Bot 完全由你的服务托管 —— Redup 不保存模型密钥、不买单推理。
        被 @ 或手动召唤时，Redup 会向你的 Webhook 地址 POST 一个 JSON
        事件，你的服务读取上下文、调用任意模型、返回一段文本，
        Redup 会用这段文本在帖子里以 Bot 身份发布回复。
      </p>

      <div className="space-y-3">
        <CodeBlock
          title="Redup → 你的服务 POST /your-webhook"
          lang="json"
          code={`{
  "bot": { "slug": "my-bot", "name": "My Bot" },
  "topic": { "id": 42, "title": "LLM 推理优化有什么新思路？" },
  "trigger": { "user_id": 7, "post_floor": 3 },
  "context": [
    { "floor": 1, "author": "alice", "content": "最近在对比 vLLM 和 ..." },
    { "floor": 2, "author": "bob",   "content": "可以试试 speculative decoding" },
    { "floor": 3, "author": "alice", "content": "@my-bot 你怎么看？" }
  ]
}`}
        />
        <CodeBlock
          title="你的服务 → Redup 响应体"
          lang="json"
          code={`{ "reply": "你问的这个问题可以从两个角度看……（Markdown 也可以）" }`}
        />
        <CodeBlock
          title="最小示例 (Node.js / Express)"
          lang="js"
          code={`import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post("/event", async (req, res) => {
  // 可选：校验 Authorization: Bearer <API Key>
  const auth = req.header("authorization") ?? "";
  if (auth !== "Bearer " + process.env.REDUP_BOT_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { topic, context } = req.body;
  const messages = [
    { role: "system", content: "你是社区里的 AI 助手，回答要简洁、有用。" },
    ...context.map((c) => ({
      role: "user",
      content: c.author + ": " + c.content,
    })),
  ];

  const r = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
  });
  res.json({ reply: r.choices[0].message.content });
});

app.listen(3000);`}
        />
      </div>

      <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <Tip icon="⏱">Webhook 请求超时约 15 秒 — 长时间推理请先在你服务里做缓存或异步回调</Tip>
        <Tip icon="🔐">设置 API Key 后，Redup 会带 <code className="font-mono">Authorization: Bearer ...</code> 头，你的服务自行校验</Tip>
        <Tip icon="📨">你也可以通过 Bot API Token 反向调用 Redup（读帖子、发回复）— 在 Bot 主页设置</Tip>
        <Tip icon="📝">返回的 reply 支持 Markdown，会以 Bot 身份发到原帖的回复区</Tip>
      </div>
    </section>
  );
}

function CodeBlock({
  title,
  lang,
  code,
}: {
  title: string;
  lang: string;
  code: string;
}) {
  return (
    <details className="group rounded-md border border-border bg-background/60">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium text-foreground">
        <span>{title}</span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground group-open:hidden">
          {lang} · 展开
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground hidden group-open:inline">
          收起
        </span>
      </summary>
      <pre className="overflow-x-auto border-t border-border px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground">
        {code}
      </pre>
    </details>
  );
}

function Tip({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 leading-relaxed">{children}</span>
    </div>
  );
}
