"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import {
  adminCreateAnnouncement,
  adminDeleteAnnouncement,
  adminListAnnouncements,
  adminSetAnnouncementPublished,
  adminUpdateAnnouncement,
  type AnnouncementInput,
  type AnnouncementLevel,
  type AnnouncementPlacement,
  type ServerAnnouncement,
} from "@/lib/api/announcements";

const PLACEMENT_LABEL: Record<AnnouncementPlacement, string> = {
  top_banner: "顶栏横幅",
  inbox: "站内信",
  home_card: "首页卡片",
};

const LEVEL_STYLE: Record<AnnouncementLevel, string> = {
  info: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  danger: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

const LEVEL_LABEL: Record<AnnouncementLevel, string> = {
  info: "信息",
  success: "成功",
  warning: "警告",
  danger: "危险",
};

interface EditorState extends AnnouncementInput {
  id: number; // 0 = new
}

const EMPTY_EDITOR: EditorState = {
  id: 0,
  title: "",
  content: "",
  placement: "top_banner",
  level: "info",
  published: false,
  dismissible: true,
};

// The backend takes RFC3339 strings. A <datetime-local> input gives us
// "YYYY-MM-DDTHH:mm" (no timezone) — we attach ":00Z" to make it UTC. This
// is a deliberate simplification: the admin form treats times as UTC. If
// localization becomes important this is the one place to change.
function toRFC3339(local: string | undefined): string | undefined {
  if (!local) return undefined;
  return `${local}:00Z`;
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<ServerAnnouncement[] | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const resp = await adminListAnnouncements();
      setItems(resp.items);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function startCreate() {
    setEditor({ ...EMPTY_EDITOR });
  }

  function startEdit(a: ServerAnnouncement) {
    setEditor({
      id: a.id,
      title: a.title,
      content: a.content,
      placement: a.placement,
      level: a.level,
      start_at: a.start_at,
      end_at: a.end_at,
      published: a.published,
      dismissible: a.dismissible,
    });
  }

  async function save() {
    if (!editor) return;
    setBusy(true);
    setError(null);
    const payload: AnnouncementInput = {
      title: editor.title,
      content: editor.content,
      placement: editor.placement,
      level: editor.level,
      start_at: editor.start_at,
      end_at: editor.end_at,
      published: editor.published,
      dismissible: editor.dismissible,
    };
    try {
      if (editor.id === 0) {
        await adminCreateAnnouncement(payload);
      } else {
        await adminUpdateAnnouncement(editor.id, payload);
      }
      setEditor(null);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(a: ServerAnnouncement) {
    setBusy(true);
    setError(null);
    try {
      await adminSetAnnouncementPublished(a.id, !a.published);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(a: ServerAnnouncement) {
    if (!confirm("确定删除这条公告？")) return;
    setBusy(true);
    setError(null);
    try {
      await adminDeleteAnnouncement(a.id);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const list = items ?? [];
  const activeCount = list.filter((i) => i.published).length;

  return (
    <>
      <AdminHeader
        title="公告管理"
        subtitle={
          items === null
            ? "加载中…"
            : `${activeCount} 条生效中 · ${list.length} 条全部`
        }
        actions={
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            + 新建公告
          </button>
        }
      />

      <div className="px-8 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {items === null && !error ? (
          <div className="text-sm text-muted-foreground">正在加载…</div>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            还没有公告
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded px-1.5 py-0.5 font-medium ${LEVEL_STYLE[a.level]}`}>
                    {LEVEL_LABEL[a.level]}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                    {PLACEMENT_LABEL[a.placement]}
                  </span>
                  {a.dismissible && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                      可关闭
                    </span>
                  )}
                  {a.published ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                      生效中
                    </span>
                  ) : (
                    <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 font-medium text-zinc-600 dark:text-zinc-400">
                      草稿
                    </span>
                  )}
                  {(a.start_at || a.end_at) && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {a.start_at ? new Date(a.start_at).toLocaleDateString("zh-CN") : "—"}{" "}
                      ~ {a.end_at ? new Date(a.end_at).toLocaleDateString("zh-CN") : "—"}
                    </span>
                  )}
                </div>

                <h3 className="mb-1 text-base font-semibold text-foreground">{a.title}</h3>
                <p className="line-clamp-2 text-sm text-muted-foreground">{a.content}</p>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => togglePublish(a)}
                    disabled={busy}
                    className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
                  >
                    {a.published ? "下线" : "发布"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(a)}
                    disabled={busy}
                    className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(a)}
                    disabled={busy}
                    className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-foreground">
              {editor.id === 0 ? "新建公告" : "编辑公告"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">标题</label>
                <input
                  value={editor.title}
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">正文</label>
                <textarea
                  value={editor.content}
                  onChange={(e) => setEditor({ ...editor, content: e.target.value })}
                  rows={5}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    展示位置
                  </label>
                  <select
                    value={editor.placement}
                    onChange={(e) =>
                      setEditor({ ...editor, placement: e.target.value as AnnouncementPlacement })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="top_banner">顶栏横幅</option>
                    <option value="inbox">站内信</option>
                    <option value="home_card">首页卡片</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">级别</label>
                  <select
                    value={editor.level}
                    onChange={(e) =>
                      setEditor({ ...editor, level: e.target.value as AnnouncementLevel })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  >
                    <option value="info">信息（蓝）</option>
                    <option value="success">成功（绿）</option>
                    <option value="warning">警告（黄）</option>
                    <option value="danger">危险（红）</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    生效时间（UTC）
                  </label>
                  <input
                    type="datetime-local"
                    value={toLocalInput(editor.start_at)}
                    onChange={(e) =>
                      setEditor({ ...editor, start_at: toRFC3339(e.target.value) })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    失效时间（UTC）
                  </label>
                  <input
                    type="datetime-local"
                    value={toLocalInput(editor.end_at)}
                    onChange={(e) => setEditor({ ...editor, end_at: toRFC3339(e.target.value) })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={editor.dismissible}
                    onChange={(e) => setEditor({ ...editor, dismissible: e.target.checked })}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-foreground">允许用户关闭</span>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={editor.published}
                    onChange={(e) => setEditor({ ...editor, published: e.target.checked })}
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-foreground">保存后立即发布</span>
                </label>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setEditor(null)}
                disabled={busy}
                className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || !editor.title.trim() || !editor.content.trim()}
                className="rounded-md bg-primary px-5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof APIError) return `${err.message} (req ${err.requestId})`;
  return "请求失败";
}
