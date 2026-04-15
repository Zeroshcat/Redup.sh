"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import {
  adminGetConversationDetail,
  adminListConversations,
  type AdminConversationDetail,
  type AdminConversationSummary,
} from "@/lib/api/messaging";
import { timeAgo } from "@/lib/utils-time";

const PAGE_SIZE = 50;

function errorMessage(err: unknown): string {
  if (err instanceof APIError) return `${err.message} (req ${err.requestId})`;
  return "请求失败";
}

export default function AdminMessagesPage() {
  const [convs, setConvs] = useState<AdminConversationSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [filterParticipant, setFilterParticipant] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AdminConversationDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const resp = await adminListConversations({
        participant_id: filterParticipant ? Number(filterParticipant) : undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setConvs(resp.items);
      setTotal(resp.total);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [filterParticipant, offset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch whose resolution updates state
    reload();
  }, [reload]);

  async function openDetail(c: AdminConversationSummary) {
    setSelected(null);
    setDetailError(null);
    try {
      const detail = await adminGetConversationDetail(c.id);
      setSelected(detail);
    } catch (err) {
      setDetailError(errorMessage(err));
    }
  }

  return (
    <>
      <AdminHeader
        title="私信管理"
        subtitle={
          convs === null
            ? "加载中…"
            : `${total.toLocaleString()} 条会话 · 用于核实骚扰类举报`
        }
      />

      <div className="px-8 py-6">
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-300">
          ⚠ <strong>隐私提醒</strong>：私信内容属于双方的非公开沟通。请只在调查具体举报或违规线索时查阅，不要批量浏览。所有打开详情的操作建议后续接入审计日志。
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={filterParticipant}
            onChange={(e) => {
              setFilterParticipant(e.target.value);
              setOffset(0);
            }}
            placeholder="participant_id"
            className="w-36 rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
          />
          <button
            type="button"
            onClick={() => {
              setFilterParticipant("");
              setOffset(0);
            }}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
          >
            清空筛选
          </button>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              ← 上一页
            </button>
            <span className="font-mono">
              {total === 0 ? 0 : offset + 1}–{Math.min(total, offset + PAGE_SIZE)} / {total}
            </span>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
            >
              下一页 →
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">ID</th>
                <th className="px-4 py-2 text-left font-medium">参与者</th>
                <th className="px-4 py-2 text-left font-medium">最新消息</th>
                <th className="px-4 py-2 text-right font-medium">更新时间</th>
                <th className="px-4 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {convs === null ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    加载中…
                  </td>
                </tr>
              ) : convs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    没有符合条件的会话
                  </td>
                </tr>
              ) : (
                convs.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">#{c.id}</td>
                    <td className="px-4 py-2 text-xs">
                      <Participant username={c.user_a_username} id={c.user_a_id} />
                      <span className="mx-1 text-muted-foreground">↔</span>
                      <Participant username={c.user_b_username} id={c.user_b_id} />
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      <div className="line-clamp-1">{c.last_message_excerpt || "—"}</div>
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {timeAgo(c.last_message_at)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => openDetail(c)}
                        className="rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent"
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(selected || detailError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {selected
                    ? `#${selected.id}: @${selected.user_a_username} ↔ @${selected.user_b_username}`
                    : "详情"}
                </h3>
                {selected && (
                  <p className="text-[10px] text-muted-foreground">
                    {selected.messages.length} 条消息 · 创建于{" "}
                    {new Date(selected.created_at).toLocaleString("zh-CN")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setDetailError(null);
                }}
                className="rounded-md border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                关闭
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {detailError && (
                <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                  {detailError}
                </div>
              )}
              {selected && selected.messages.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground">没有消息</p>
              ) : (
                selected?.messages.map((m) => {
                  const isA = m.sender_id === selected.user_a_id;
                  const name = isA ? selected.user_a_username : selected.user_b_username;
                  return (
                    <div key={m.id} className="mb-3 border-l-2 border-border pl-3">
                      <div className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">@{name || `#${m.sender_id}`}</span>
                        <span>#{m.id}</span>
                        <span>{timeAgo(m.created_at)}</span>
                        {!m.read_at && (
                          <span className="rounded bg-primary/15 px-1.5 py-0 text-[10px] font-semibold text-primary">
                            未读
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-xs text-foreground">{m.content}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Participant({ username, id }: { username: string; id: number }) {
  if (username) {
    return (
      <Link href={`/u/${username}`} className="font-medium text-foreground hover:underline">
        @{username}
      </Link>
    );
  }
  return <span className="text-muted-foreground">#{id}（已删除）</span>;
}
