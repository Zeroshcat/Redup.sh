"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { APIError } from "@/lib/api-client";
import { createBot, type BotInput } from "@/lib/api/bot";
import { useAuthStore } from "@/store/auth";

const ERROR_MESSAGES: Record<string, string> = {
  bot_slug_taken: "Slug 已被占用",
  invalid_slug: "Slug 必须为 3-32 位小写字母、数字或短横线",
  invalid_name: "名称必须 2-32 字",
  invalid_description: "描述必须 10-512 字",
  invalid_webhook: "Webhook URL 必填，且必须是 http(s):// 开头",
  unauthorized: "请先登录",
};

const EMPTY: BotInput = {
  slug: "",
  name: "",
  description: "",
  webhook_url: "",
  api_key: "",
  model_provider: "",
  model_name: "",
  system_prompt: "",
  tags: "",
};

export function CreateBotButton() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<BotInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
    setBusy(false);
  }

  function update<K extends keyof BotInput>(key: K, value: BotInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    if (!me) {
      alert("请先登录");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createBot(form);
      close();
      setForm(EMPTY);
      router.push(`/bot/${created.slug}`);
      router.refresh();
    } catch (err) {
      if (err instanceof APIError) {
        setError(`${ERROR_MESSAGES[err.code] ?? err.message} (req ${err.requestId})`);
      } else {
        setError("提交失败");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!me) {
            alert("请先登录");
            return;
          }
          setOpen(true);
        }}
        className="rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
      >
        + 创建 Bot
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          onClick={() => !busy && close()}
        >
          <div
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-base font-semibold text-foreground">创建 Bot 申请</h3>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <p className="mb-4 rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-[11px] text-violet-700 dark:text-violet-300">
                ℹ 你的 Bot 是自托管的：触发时 Redup 会向你的 Webhook URL 发送 JSON 事件，你的服务返回 <code className="font-mono">{`{ reply: "..." }`}</code>。
                支持任意语言、任意模型，由你自己买单。
              </p>

              <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Slug" hint="3-32 位小写字母、数字或短横线">
                  <input
                    value={form.slug}
                    onChange={(e) => update("slug", e.target.value.toLowerCase())}
                    placeholder="my-bot"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
                  />
                </Field>
                <Field label="名称">
                  <input
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="My Bot"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                </Field>
              </div>

              <Field label="简介" hint="10-512 字">
                <textarea
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </Field>

              <Field label="Webhook URL" hint="必填。Redup 会 POST 事件到这个地址">
                <input
                  value={form.webhook_url}
                  onChange={(e) => update("webhook_url", e.target.value)}
                  placeholder="https://your-bot.example.com/event"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
                />
              </Field>

              <Field label="API Key" hint="可选。Redup 会以 Authorization: Bearer 头发送此值，由你的服务校验">
                <input
                  type="password"
                  value={form.api_key ?? ""}
                  onChange={(e) => update("api_key", e.target.value)}
                  placeholder="留空则不发送 Authorization 头"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
                />
              </Field>

              <div className="grid gap-3 md:grid-cols-2">
                <Field label="模型展示标签 - 提供方" hint="可选，仅展示用">
                  <input
                    value={form.model_provider ?? ""}
                    onChange={(e) => update("model_provider", e.target.value)}
                    placeholder="OpenAI / Anthropic / 自部署"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                </Field>
                <Field label="模型展示标签 - 名称" hint="可选，仅展示用">
                  <input
                    value={form.model_name ?? ""}
                    onChange={(e) => update("model_name", e.target.value)}
                    placeholder="gpt-4o-mini / claude-haiku"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
                  />
                </Field>
              </div>

              <Field label="System Prompt（可选展示）" hint="仅作为文档展示给浏览者，不会被 Redup 调用">
                <textarea
                  value={form.system_prompt ?? ""}
                  onChange={(e) => update("system_prompt", e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-ring"
                />
              </Field>

              <Field label="标签（可选）" hint="逗号分隔">
                <input
                  value={form.tags ?? ""}
                  onChange={(e) => update("tags", e.target.value)}
                  placeholder="AI, 助手, 翻译"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </Field>
              </div>

              {error && (
                <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                  {error}
                </div>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-3">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "提交中…" : "提交申请"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
      <label className="mb-1.5 block text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
