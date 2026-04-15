"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { APIError } from "@/lib/api-client";
import { listBots, summonBot, type ServerBot } from "@/lib/api/bot";
import { useAuthStore } from "@/store/auth";

const ERROR_MESSAGES: Record<string, string> = {
  bot_invoke_failed: "Bot 调用失败，请稍后再试",
  not_found: "Bot 不存在或未上线",
  unauthorized: "请先登录",
};

export function SummonBotButton({ topicId }: { topicId: number }) {
  const router = useRouter();
  const isAuthed = useAuthStore((s) => Boolean(s.user));
  const [open, setOpen] = useState(false);
  const [bots, setBots] = useState<ServerBot[] | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open || bots !== null) return;
    listBots()
      .then((r) => setBots(r.items))
      .catch(() => setBots([]));
  }, [open, bots]);

  function close() {
    if (busySlug) return;
    setOpen(false);
    setError(null);
    setSuccess(null);
  }

  async function summon(b: ServerBot) {
    setBusySlug(b.slug);
    setError(null);
    setSuccess(null);
    try {
      await summonBot(topicId, b.slug);
      setSuccess(`@${b.slug} 已回复，正在刷新…`);
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setSuccess(null);
      }, 1200);
    } catch (err) {
      if (err instanceof APIError) {
        setError(`${ERROR_MESSAGES[err.code] ?? err.message} (req ${err.requestId})`);
      } else {
        setError("调用失败，请稍后再试");
      }
    } finally {
      setBusySlug(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!isAuthed) {
            alert("请先登录");
            return;
          }
          setOpen(true);
        }}
        title="召唤一个 Bot 来回复此帖"
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        ⚡ 召唤 Bot
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">召唤 Bot 回复此帖</h3>
              <button
                type="button"
                onClick={close}
                disabled={busySlug !== null}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <p className="mb-4 rounded-md border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-[11px] text-violet-700 dark:text-violet-300">
              ⚡ Bot 会读取本帖标题 + 最近回帖作为上下文，调用配置的模型生成回复。耗时通常 3-15 秒。
            </p>

            {bots === null ? (
              <div className="py-6 text-center text-sm text-muted-foreground">加载 Bot 列表…</div>
            ) : bots.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
                还没有任何已上线的 Bot
              </div>
            ) : (
              <div className="max-h-80 space-y-2 overflow-auto">
                {bots.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => summon(b)}
                    disabled={busySlug !== null}
                    className="flex w-full items-start gap-3 rounded-md border border-violet-500/20 bg-gradient-to-br from-card to-violet-500/5 p-3 text-left transition hover:border-violet-500/40 disabled:opacity-50"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-400 to-violet-600 text-base text-white">
                      ⚡
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        {b.name}
                        <span className="font-mono text-[10px] text-muted-foreground">@{b.slug}</span>
                      </div>
                      <div className="line-clamp-1 text-[11px] text-muted-foreground">
                        {b.description}
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {b.model_provider} · {b.model_name}
                      </div>
                    </div>
                    {busySlug === b.slug && (
                      <span className="shrink-0 text-[11px] text-violet-600 dark:text-violet-400">
                        调用中…
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                {error}
              </div>
            )}
            {success && (
              <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
                ✓ {success}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
