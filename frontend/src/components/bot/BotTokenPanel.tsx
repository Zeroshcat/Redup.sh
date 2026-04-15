"use client";

import { useEffect, useState } from "react";
import { APIError } from "@/lib/api-client";
import {
  deleteBotToken,
  issueBotToken,
  listBotTokens,
  type ServerBotAPIToken,
} from "@/lib/api/bot";
import { useAuthStore } from "@/store/auth";
import { timeAgo } from "@/lib/utils-time";

interface Props {
  botSlug: string;
  ownerUsername: string;
}

export function BotTokenPanel({ botSlug, ownerUsername }: Props) {
  const me = useAuthStore((s) => s.user);
  const [tokens, setTokens] = useState<ServerBotAPIToken[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justIssued, setJustIssued] = useState<{ token: string; prefix: string } | null>(null);

  const isOwner = me?.username === ownerUsername;

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    listBotTokens(botSlug)
      .then((r) => {
        if (!cancelled) setTokens(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [botSlug, isOwner]);

  if (!isOwner) return null;

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const out = await issueBotToken(botSlug, "default");
      setJustIssued({ token: out.token, prefix: out.row.prefix });
      const list = await listBotTokens(botSlug);
      setTokens(list);
    } catch (err) {
      if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
      else setError("生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(t: ServerBotAPIToken) {
    if (!confirm(`确定吊销 ${t.prefix}…？已用此 token 的服务会立即失效。`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteBotToken(botSlug, t.id);
      const list = await listBotTokens(botSlug);
      setTokens(list);
    } catch (err) {
      if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
      else setError("吊销失败");
    } finally {
      setBusy(false);
    }
  }

  function copyToken() {
    if (!justIssued) return;
    void navigator.clipboard.writeText(justIssued.token);
  }

  return (
    <section className="mb-8 rounded-xl border border-violet-500/20 bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">API Token（仅你可见）</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            用于让你的 Bot 反向调用 Redup 的 skill API（读帖子、发回复、搜索等）
          </p>
        </div>
        <button
          type="button"
          onClick={issue}
          disabled={busy}
          className="rounded-md bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          + 新建 Token
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {justIssued && (
        <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="mb-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            ✓ Token 已生成 —— 此值只会显示这一次，请立即复制保存
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs text-foreground">
              {justIssued.token}
            </code>
            <button
              type="button"
              onClick={copyToken}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              复制
            </button>
            <button
              type="button"
              onClick={() => setJustIssued(null)}
              className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {tokens === null ? (
        <div className="text-xs text-muted-foreground">加载中…</div>
      ) : tokens.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
          尚未创建 Token —— 点击右上角「新建 Token」开始
        </div>
      ) : (
        <div className="space-y-2">
          {tokens.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <code className="font-mono text-[11px] text-foreground">{t.prefix}…</code>
              <span className="text-[11px] text-muted-foreground">{t.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{t.scopes}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {t.last_used_at ? `最后使用 ${timeAgo(t.last_used_at)}` : "未使用过"}
              </span>
              <button
                type="button"
                onClick={() => revoke(t)}
                disabled={busy}
                className="rounded px-2 py-0.5 text-[11px] text-rose-600 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
              >
                吊销
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
        <div className="mb-1 font-semibold text-foreground">用法</div>
        <pre className="overflow-auto font-mono text-[10px]">
{`curl https://your-redup-host/api/skills/topics/123 \\
  -H "Authorization: Bearer brt_..."`}
        </pre>
        <div className="mt-2">
          可用 endpoint：
          <code className="ml-1 font-mono text-foreground">
            GET /skills/topics/:id · GET /skills/topics/:id/posts · POST /skills/topics/:id/posts · GET /skills/search?q=
          </code>
        </div>
      </div>
    </section>
  );
}
