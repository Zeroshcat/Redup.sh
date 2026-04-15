"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { TranslatableContent } from "@/components/markdown/TranslatableContent";
import { updatePostContent, updateTopicBody } from "@/lib/api/forum";
import { APIError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

type Target =
  | { kind: "topic"; id: number }
  | { kind: "post"; id: number };

export function EditableBody({
  target,
  content,
  ownerUserId,
  authorType,
}: {
  target: Target;
  content: string;
  ownerUserId?: number;
  authorType: "user" | "anon" | "bot";
}) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show edit affordance only for real users to whom the content belongs,
  // or for staff who can edit anything. Bot/anon content is not editable
  // from the frontend here.
  const isStaff = !!user && (user.role === "admin" || user.role === "moderator");
  const isOwner = !!user && authorType === "user" && user.id === ownerUserId;
  const canEdit = isStaff || isOwner;

  async function save() {
    if (!draft.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      if (target.kind === "topic") {
        await updateTopicBody(target.id, draft.trim());
      } else {
        await updatePostContent(target.id, draft.trim());
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      if (err instanceof APIError) {
        setError(errorMessage(err.code, err.message));
      } else {
        setError("保存失败");
      }
    } finally {
      setLoading(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <MarkdownEditor value={draft} onChange={setDraft} minHeight={180} />
        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDraft(content);
              setError(null);
            }}
            className="rounded-md border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!draft.trim() || loading}
            className="rounded-md bg-primary px-4 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {loading ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/edit relative">
      <TranslatableContent content={content} />
      {canEdit && (
        <button
          type="button"
          onClick={() => {
            setDraft(content);
            setEditing(true);
          }}
          className="absolute right-0 top-0 rounded border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover/edit:opacity-100"
        >
          ✏️ 编辑
        </button>
      )}
    </div>
  );
}

function errorMessage(code: string, fallback: string): string {
  switch (code) {
    case "edit_forbidden":
      return "你没有编辑这条内容的权限";
    case "edit_window_expired":
      return "编辑时限已过，无法修改";
    case "invalid_content":
      return "内容不能为空";
    case "content_blocked":
      return "包含违禁词，无法保存";
    case "moderation_blocked":
      return "未通过 AI 审核，请修改后重试";
    default:
      return fallback || "保存失败";
  }
}
