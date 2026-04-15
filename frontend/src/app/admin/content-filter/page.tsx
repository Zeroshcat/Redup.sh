"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import {
  adminCreateFilterWord,
  adminDeleteFilterWord,
  adminListFilterWords,
  adminUpdateFilterWord,
  type ServerFilterWord,
  type WordSeverity,
} from "@/lib/api/contentfilter";
import { timeAgo } from "@/lib/utils-time";

const SEVERITY_LABEL: Record<WordSeverity, { label: string; cls: string }> = {
  block: { label: "拦截", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  warn: { label: "警告", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
};

const ERROR_MESSAGES: Record<string, string> = {
  empty_word: "敏感词不能为空",
  word_too_long: "敏感词不能超过 64 字",
  invalid_severity: "等级必须是拦截或警告",
};

function errorMessage(err: unknown): string {
  if (err instanceof APIError) {
    return `${ERROR_MESSAGES[err.code] ?? err.message} (req ${err.requestId})`;
  }
  return "请求失败";
}

export default function AdminContentFilterPage() {
  const [items, setItems] = useState<ServerFilterWord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{
    id?: number;
    word: string;
    severity: WordSeverity;
    note: string;
    enabled: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const list = await adminListFilterWords();
      setItems(list);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function startCreate() {
    setEditor({ word: "", severity: "block", note: "", enabled: true });
  }

  function startEdit(w: ServerFilterWord) {
    setEditor({
      id: w.id,
      word: w.word,
      severity: w.severity,
      note: w.note ?? "",
      enabled: w.enabled,
    });
  }

  async function save() {
    if (!editor) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        word: editor.word.trim(),
        severity: editor.severity,
        note: editor.note,
        enabled: editor.enabled,
      };
      if (editor.id) {
        await adminUpdateFilterWord(editor.id, payload);
      } else {
        await adminCreateFilterWord(payload);
      }
      setEditor(null);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(w: ServerFilterWord) {
    if (!confirm(`确定删除「${w.word}」？`)) return;
    setBusy(true);
    setError(null);
    try {
      await adminDeleteFilterWord(w.id);
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(w: ServerFilterWord) {
    setBusy(true);
    setError(null);
    try {
      await adminUpdateFilterWord(w.id, {
        word: w.word,
        severity: w.severity,
        note: w.note,
        enabled: !w.enabled,
      });
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const list = items ?? [];
  const blockCount = list.filter((w) => w.severity === "block" && w.enabled).length;

  return (
    <>
      <AdminHeader
        title="内容过滤"
        subtitle={items ? `共 ${list.length} 个词条 · ${blockCount} 个拦截规则启用中` : "正在加载…"}
        actions={
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            + 新增词条
          </button>
        }
      />

      <div className="px-8 py-6">
        <div className="mb-4 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-700 dark:text-blue-300">
          ℹ 拦截级词条会让发主题/发回帖直接失败（前端显示「包含违禁词」），警告级仅记录不阻断。匹配为大小写不敏感的子串。
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {!items && !error ? (
          <div className="text-sm text-muted-foreground">正在加载…</div>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            还没有词条 —— 点右上角添加
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">词条</th>
                  <th className="px-4 py-2.5 text-left font-medium">级别</th>
                  <th className="px-4 py-2.5 text-left font-medium">状态</th>
                  <th className="px-4 py-2.5 text-left font-medium">备注</th>
                  <th className="px-4 py-2.5 text-left font-medium">添加时间</th>
                  <th className="px-4 py-2.5 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((w) => {
                  const sev = SEVERITY_LABEL[w.severity];
                  return (
                    <tr key={w.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3 font-mono text-sm text-foreground">{w.word}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${sev.cls}`}>
                          {sev.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {w.enabled ? (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            启用
                          </span>
                        ) : (
                          <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                            禁用
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{w.note || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{timeAgo(w.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => toggleEnabled(w)}
                            disabled={busy}
                            className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                          >
                            {w.enabled ? "禁用" : "启用"}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(w)}
                            className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(w)}
                            disabled={busy}
                            className="rounded px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-foreground">
              {editor.id ? "编辑词条" : "新增词条"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">词条</label>
                <input
                  value={editor.word}
                  onChange={(e) => setEditor({ ...editor, word: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">级别</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["block", "warn"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setEditor({ ...editor, severity: s })}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                        editor.severity === s
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {SEVERITY_LABEL[s].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">备注（可选）</label>
                <input
                  value={editor.note}
                  onChange={(e) => setEditor({ ...editor, note: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={editor.enabled}
                  onChange={(e) => setEditor({ ...editor, enabled: e.target.checked })}
                  className="h-3.5 w-3.5"
                />
                启用此词条
              </label>
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
                disabled={busy || !editor.word.trim()}
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
