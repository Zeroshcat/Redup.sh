"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import type { ReplyTarget } from "./ReplyButton";
import { createPost } from "@/lib/api/forum";
import { APIError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

export function ReplyComposer({
  topicId,
  isAnonCategory = false,
}: {
  topicId: number;
  isAnonCategory?: boolean;
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // Synchronous lock — prevents rapid double-click from firing two requests
  // before React commits setLoading(true). See /new page for the same pattern.
  const submittingRef = useRef(false);

  useEffect(() => {
    function onReplyTo(e: Event) {
      const detail = (e as CustomEvent<ReplyTarget | null>).detail;
      setReplyTo(detail ?? null);
    }
    window.addEventListener("redup:reply-to", onReplyTo);
    return () => window.removeEventListener("redup:reply-to", onReplyTo);
  }, []);

  if (!user) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        请先 <Link href="/login" className="font-medium text-foreground underline">登录</Link> 后再回复
      </div>
    );
  }

  async function onSubmit() {
    if (!content.trim() || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setSuggestion(null);
    setLoading(true);
    try {
      await createPost(topicId, {
        content: content.trim(),
        reply_to_floor: replyTo?.floor,
      });
      setContent("");
      setReplyTo(null);
      router.refresh();
    } catch (err) {
      if (err instanceof APIError) {
        if (err.code === "duplicate_submission") {
          setError("你刚刚已经发过同样的内容了，请稍等几秒再试");
        } else {
          setError(err.message);
        }
        if (err.code === "moderation_blocked" && err.data) {
          const d = err.data as { suggestion?: string };
          if (d.suggestion) setSuggestion(d.suggestion);
        }
      } else {
        setError("发送失败");
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    setContent(suggestion);
    setSuggestion(null);
    setError(null);
  }

  return (
    <div id="reply-composer" className="space-y-3 scroll-mt-20">
      {replyTo && (
        <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            正在回复 <span className="font-medium text-foreground">#{replyTo.floor} {replyTo.authorName}</span>
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕ 取消
          </button>
        </div>
      )}
      <MarkdownEditor
        value={content}
        onChange={setContent}
        placeholder="写下你的回复… 支持 Markdown，输入 @ 可以召唤 Bot"
        minHeight={180}
      />
      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}
      {suggestion && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="mb-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            💡 AI 修改建议
          </div>
          <pre className="mb-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background px-3 py-2 text-xs text-foreground">
            {suggestion}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={applySuggestion}
              className="rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
            >
              采用建议并替换正文
            </button>
            <button
              type="button"
              onClick={() => setSuggestion(null)}
              className="rounded-md border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
            >
              忽略
            </button>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        {isAnonCategory ? (
          <span className="text-xs text-muted-foreground">🎭 匿名发言（当前板块强制匿名）</span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!content.trim() || loading}
          className="rounded-md bg-primary px-5 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {loading ? "发送中…" : "发送回复"}
        </button>
      </div>
    </div>
  );
}
