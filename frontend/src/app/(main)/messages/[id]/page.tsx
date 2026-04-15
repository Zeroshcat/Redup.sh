"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { APIError } from "@/lib/api-client";
import {
  getMessages,
  markConversationRead,
  sendMessage,
  type ServerMessage,
} from "@/lib/api/messaging";
import { useStream } from "@/lib/stream";
import { useAuthStore } from "@/store/auth";

const MAX_LEN = 2000;

const ERROR_MESSAGES: Record<string, string> = {
  empty_message: "消息不能为空",
  message_too_long: "消息不能超过 2000 字",
  self_message: "不能给自己发私信",
  not_found: "对方不存在",
  forbidden: "无权访问这个对话",
};

function errMsg(err: unknown): string {
  if (err instanceof APIError) {
    return `${ERROR_MESSAGES[err.code] ?? err.message} (req ${err.requestId})`;
  }
  return "请求失败";
}

export default function ConversationPage() {
  const params = useParams<{ id: string }>();
  const otherID = Number(params.id);
  const me = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<ServerMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Initial load + mark read. Live updates are delivered via useStream below.
  useEffect(() => {
    if (!me || !Number.isFinite(otherID)) return;
    let cancelled = false;

    async function load() {
      try {
        const r = await getMessages(otherID);
        if (cancelled) return;
        setMessages(r.messages);
        setLoaded(true);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(errMsg(err));
      }
    }

    load().then(() => {
      if (!cancelled) void markConversationRead(otherID).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [me, otherID]);

  // Real-time append: SSE pushes message.new events for both sender and
  // recipient. Filter to this conversation and skip the round-trip echo of
  // our own just-sent message (we already added it optimistically).
  useStream(
    {
      "message.new": (data: unknown) => {
        const d = data as {
          message?: ServerMessage;
          other_user_id?: number;
        } | null;
        if (!d?.message || d.other_user_id !== otherID) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === d.message!.id)) return prev;
          return [...prev, d.message!];
        });
        // If the server-pushed message was from the other party, mark read.
        if (d.message.sender_id !== me?.id) {
          void markConversationRead(otherID).catch(() => {});
        }
      },
    },
    Boolean(me),
  );

  // Auto-scroll to bottom on new message count.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await sendMessage(otherID, content);
      setMessages((prev) => [...prev, r.message]);
      setDraft("");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  if (!me) return null;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-card px-6 py-3">
        <Link
          href="/messages"
          className="text-xs text-muted-foreground hover:text-foreground md:hidden"
        >
          ← 返回
        </Link>
        <div className="text-sm font-semibold text-foreground">私信</div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {!loaded ? (
          <div className="text-center text-xs text-muted-foreground">加载中…</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground">
            还没有消息。发送第一句话开启对话吧。
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => {
              const mine = m.sender_id === me.id;
              return (
                <div
                  key={m.id}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                      mine
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-muted text-foreground"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                    <div
                      className={`mt-1 text-[10px] ${
                        mine ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}
                    >
                      {new Date(m.created_at).toLocaleString("zh-CN")}
                      {mine && m.read_at && " · 已读"}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && (
        <div className="border-t border-rose-500/30 bg-rose-500/10 px-6 py-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      <div className="border-t border-border bg-card px-6 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={MAX_LEN}
            placeholder="输入消息，按 Enter 发送，Shift+Enter 换行"
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !draft.trim()}
            className="shrink-0 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "发送中…" : "发送"}
          </button>
        </div>
        <div className="mt-1 text-right text-[10px] text-muted-foreground">
          {draft.length} / {MAX_LEN}
        </div>
      </div>
    </div>
  );
}
