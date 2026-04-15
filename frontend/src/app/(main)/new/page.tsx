"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { createTopic, listCategories, type ServerCategory } from "@/lib/api/forum";
import { APIError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

// Suspense boundary is required for any client component that calls
// useSearchParams() — Next.js static generation bails out otherwise and
// fails the prod build with a CSR-bailout error on /new.
export default function NewTopicPage() {
  return (
    <Suspense fallback={null}>
      <NewTopicInner />
    </Suspense>
  );
}

function NewTopicInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const [categories, setCategories] = useState<ServerCategory[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [anon, setAnon] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    listCategories()
      .then((items) => {
        setCategories(items);
        const urlCategory = searchParams.get("category");
        if (urlCategory && items.some((c) => c.slug === urlCategory)) {
          setCategorySlug(urlCategory);
        } else if (items.length > 0) {
          setCategorySlug(items[0].slug);
        }
      })
      .catch(() => {
        setError("无法加载板块列表");
      });
  }, [searchParams]);

  const category = categories.find((c) => c.slug === categorySlug);
  const isAnonCategory = category?.type === "anon";
  const isBotCategory = category?.type === "bot";

  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t) || tags.length >= 5) return;
    setTags([...tags, t]);
    setTagInput("");
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  const canSubmit =
    !!user &&
    [...title.trim()].length >= 2 &&
    [...body.trim()].length >= 2 &&
    categorySlug !== "";

  async function onSubmit() {
    if (!canSubmit || loading) return;
    setError(null);
    setSuggestion(null);
    setLoading(true);
    try {
      const topic = await createTopic({
        category: categorySlug,
        title: title.trim(),
        body: body.trim(),
        is_anon: anon || isAnonCategory,
      });
      router.push(`/topic/${topic.id}`);
    } catch (err) {
      if (err instanceof APIError) {
        setError(errorMessage(err));
        if (err.code === "moderation_blocked" && err.data) {
          const d = err.data as { suggestion?: string };
          if (d.suggestion) setSuggestion(d.suggestion);
        }
      } else {
        setError("发布失败");
      }
    } finally {
      setLoading(false);
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    // Suggestion is the rewritten body (LLM-generated). Replace the body
    // and let the user tweak the title if needed.
    setBody(suggestion);
    setSuggestion(null);
    setError(null);
  }

  if (hydrated && !user) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 text-center">
        <h1 className="mb-3 text-2xl font-bold text-foreground">请先登录</h1>
        <p className="mb-6 text-sm text-muted-foreground">登录后即可发布新帖</p>
        <Link
          href="/login"
          className="inline-block rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          前往登录
        </Link>
      </main>
    );
  }

  const groupedNormal = categories.filter((c) => c.type === "normal");
  const groupedAnon = categories.filter((c) => c.type === "anon");
  const groupedBot = categories.filter((c) => c.type === "bot");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">首页</Link>
        <span className="mx-1.5">›</span>
        <span className="text-foreground">发帖</span>
      </nav>

      <h1 className="mb-6 text-2xl font-bold text-foreground">发新帖</h1>

      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            板块
          </label>
          <select
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          >
            {groupedNormal.length > 0 && (
              <optgroup label="主社区">
                {groupedNormal.map((c) => (
                  <option key={c.id} value={c.slug}>{c.name}</option>
                ))}
              </optgroup>
            )}
            {groupedAnon.length > 0 && (
              <optgroup label="匿名区">
                {groupedAnon.map((c) => (
                  <option key={c.id} value={c.slug}>{c.name}</option>
                ))}
              </optgroup>
            )}
            {groupedBot.length > 0 && (
              <optgroup label="Bot 区">
                {groupedBot.map((c) => (
                  <option key={c.id} value={c.slug}>{c.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          {isAnonCategory && (
            <div className="mt-2 rounded border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              ⚠ 匿名板块强制匿名，发帖后无法看到你的真实账号，但平台后台可追溯。
            </div>
          )}
          {isBotCategory && (
            <div className="mt-2 rounded border border-violet-500/30 bg-violet-500/5 px-3 py-2 text-xs text-violet-600 dark:text-violet-400">
              🤖 Bot 板块：你的帖子可能被 Bot 自动回复。
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            标题 <span className="text-muted-foreground/60">（2-200 字符）</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="清晰描述你的问题或话题"
            maxLength={200}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus:border-ring"
          />
          <div className="mt-1 text-right text-[11px] text-muted-foreground">
            {[...title].length} / 200
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            正文
          </label>
          <MarkdownEditor
            value={body}
            onChange={setBody}
            placeholder="支持 Markdown：# 标题 **粗体** `代码` [链接](url)，输入 @ 可召唤 Bot…"
            minHeight={320}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            标签 <span className="text-muted-foreground/60">（最多 5 个，回车添加）</span>
          </label>
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-foreground"
              >
                #{t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder={tags.length === 0 ? "输入后回车" : ""}
              className="flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
              disabled={tags.length >= 5}
            />
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {suggestion && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="mb-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
              💡 AI 修改建议（针对正文）
            </div>
            <pre className="mb-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background px-3 py-2 text-sm text-foreground">
              {suggestion}
            </pre>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applySuggestion}
                className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90"
              >
                采用建议替换正文
              </button>
              <button
                type="button"
                onClick={() => setSuggestion(null)}
                className="rounded-md border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent"
              >
                忽略并自行修改
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-5">
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={anon || isAnonCategory}
              onChange={(e) => setAnon(e.target.checked)}
              disabled={isAnonCategory}
              className="h-4 w-4"
            />
            匿名发帖
          </label>

          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              取消
            </Link>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit || loading}
              className="rounded-md bg-primary px-5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {loading ? "发布中…" : "发布"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function errorMessage(err: APIError): string {
  switch (err.code) {
    case "invalid_title":
      return "标题需要 2–200 字符";
    case "invalid_content":
      return "正文不能为空";
    case "not_found":
      return "板块不存在";
    case "unauthorized":
    case "token_invalid":
      return "请先登录";
    default:
      return err.message || "发布失败";
  }
}
