"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import {
  adminCreateCategory,
  adminDeleteCategory,
  adminMoveCategory,
  adminUpdateCategory,
  listCategories,
  type CategoryInput,
  type ServerCategory,
} from "@/lib/api/forum";

type EditorState = {
  id?: number;
  name: string;
  slug: string;
  description: string;
  type: "normal" | "anon" | "bot";
  postCooldown: number;
  allowBot: boolean;
  rules: string;
};

const EMPTY_EDITOR: EditorState = {
  name: "",
  slug: "",
  description: "",
  type: "normal",
  postCooldown: 0,
  allowBot: true,
  rules: "",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_category: "板块字段不合法（名称 1-64 字、slug 必须为小写字母数字短横线）",
  category_slug_taken: "Slug 已存在，换一个吧",
  category_in_use: "板块下还有帖子，无法删除",
  cannot_move: "已经在边界，无法继续移动",
  forbidden: "权限不足",
  unauthorized: "请先登录",
};

function errorMessage(err: unknown): string {
  if (err instanceof APIError) {
    const msg = ERROR_MESSAGES[err.code] ?? err.message;
    return `${msg} (req ${err.requestId})`;
  }
  return "请求失败，请检查网络";
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<ServerCategory[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function reload() {
    try {
      const list = await listCategories();
      setCategories(list);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function startEdit(c: ServerCategory) {
    setEditorError(null);
    setEditor({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      type: c.type,
      postCooldown: c.post_cooldown,
      allowBot: c.allow_bot,
      rules: c.rules ?? "",
    });
  }

  function startCreate() {
    setEditorError(null);
    setEditor({ ...EMPTY_EDITOR });
  }

  function closeEditor() {
    setEditor(null);
    setEditorError(null);
  }

  async function save() {
    if (!editor) return;
    const payload: CategoryInput = {
      name: editor.name.trim(),
      slug: editor.slug.trim().toLowerCase(),
      description: editor.description.trim(),
      type: editor.type,
      post_cooldown: editor.postCooldown,
      allow_bot: editor.allowBot,
      rules: editor.rules,
    };
    setSaving(true);
    setEditorError(null);
    try {
      if (editor.id) {
        await adminUpdateCategory(editor.id, payload);
      } else {
        await adminCreateCategory(payload);
      }
      await reload();
      closeEditor();
    } catch (err) {
      setEditorError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: ServerCategory) {
    if (!confirm(`确定删除「${c.name}」？板块下不能有帖子。`)) return;
    setActionError(null);
    try {
      await adminDeleteCategory(c.id);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  async function move(c: ServerCategory, direction: "up" | "down") {
    setActionError(null);
    try {
      await adminMoveCategory(c.id, direction);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  }

  const list = categories ?? [];
  const grouped = {
    normal: list.filter((c) => c.type === "normal"),
    anon: list.filter((c) => c.type === "anon"),
    bot: list.filter((c) => c.type === "bot"),
  };

  return (
    <>
      <AdminHeader
        title="板块管理"
        subtitle={
          categories
            ? `共 ${list.length} 个板块 · 正常 ${grouped.normal.length} · 匿名 ${grouped.anon.length} · Bot ${grouped.bot.length}`
            : "正在加载…"
        }
        actions={
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            + 新建板块
          </button>
        }
      />

      <div className="px-8 py-6">
        {loadError && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {loadError}
          </div>
        )}
        {actionError && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {actionError}
          </div>
        )}

        {(["normal", "anon", "bot"] as const).map((type) => {
          const items = grouped[type];
          return (
            <section key={type} className="mb-8">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                {type === "normal" ? "主社区板块" : type === "anon" ? "匿名区板块" : "Bot 区板块"}
              </h2>

              {categories && items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
                  该分类下暂无板块
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="w-10 px-2 py-2.5 text-center font-medium">序</th>
                        <th className="px-4 py-2.5 text-left font-medium">板块</th>
                        <th className="px-4 py-2.5 text-left font-medium">Slug</th>
                        <th className="px-4 py-2.5 text-left font-medium">帖子数</th>
                        <th className="px-4 py-2.5 text-right font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map((c, i) => (
                        <tr key={c.id} className="hover:bg-accent/40">
                          <td className="px-2 py-3 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <button
                                type="button"
                                disabled={i === 0}
                                onClick={() => move(c, "up")}
                                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={i === items.length - 1}
                                onClick={() => move(c, "down")}
                                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                              >
                                ▼
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{c.name}</div>
                            <div className="line-clamp-1 text-[11px] text-muted-foreground">
                              {c.description}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {c.slug}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-foreground">
                            {c.topic_count.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(c)}
                                className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                编辑
                              </button>
                              <button
                                type="button"
                                onClick={() => remove(c)}
                                className="rounded px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                              >
                                删除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-foreground">
              {editor.id ? "编辑板块" : "新建板块"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">板块类型</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["normal", "anon", "bot"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditor({ ...editor, type: t })}
                      className={`rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                        editor.type === t
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {t === "normal" ? "主社区" : t === "anon" ? "匿名" : "Bot"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">名称</label>
                  <input
                    value={editor.name}
                    onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">Slug</label>
                  <input
                    value={editor.slug}
                    onChange={(e) => setEditor({ ...editor, slug: e.target.value })}
                    placeholder="tech"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">描述</label>
                <textarea
                  value={editor.description}
                  onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>

              {editor.type === "anon" && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-300">
                  ⚠ 匿名板块会启用独立规则（冷却、信用门槛、salt 混淆）。详细策略在「匿名策略」页配置。
                </div>
              )}

              {editor.type === "bot" && (
                <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3 text-[11px] text-violet-700 dark:text-violet-300">
                  🤖 Bot 板块允许 Bot 主动参与讨论，而非只被 @ 触发。
                </div>
              )}

              <div>
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={editor.allowBot}
                    onChange={(e) => setEditor({ ...editor, allowBot: e.target.checked })}
                    className="h-3.5 w-3.5"
                  />
                  允许 Bot 在此板块活动
                </label>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">
                  发帖冷却（秒）
                </label>
                <input
                  type="number"
                  value={editor.postCooldown}
                  onChange={(e) =>
                    setEditor({ ...editor, postCooldown: Number(e.target.value) })
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">
                  板规（本板特殊规则）
                </label>
                <textarea
                  value={editor.rules}
                  onChange={(e) => setEditor({ ...editor, rules: e.target.value })}
                  rows={5}
                  placeholder="例：禁止发布纯图片求助、回复必须附代码 snippet…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-ring"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  会喂给 AI 审核模型作为本板的额外判决依据，并在板块首页作为折叠卡片展示给用户。
                  留空表示只按全站规则审核。
                </p>
              </div>

              {editorError && (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                  {editorError}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={closeEditor}
                disabled={saving}
                className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !editor.name.trim() || !editor.slug.trim()}
                className="rounded-md bg-primary px-5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
