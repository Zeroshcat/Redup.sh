"use client";

import { useEffect, useState } from "react";
import { APIError } from "@/lib/api-client";
import {
  followUser,
  getFollowStats,
  unfollowUser,
  type FollowStats,
} from "@/lib/api/follow";
import { useAuthStore } from "@/store/auth";

const ERROR_MESSAGES: Record<string, string> = {
  self_follow: "不能关注自己",
  unauthorized: "请先登录",
  not_found: "用户不存在",
};

export function FollowButton({
  targetUserId,
  targetUsername,
}: {
  targetUserId: number;
  targetUsername: string;
}) {
  const me = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<FollowStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFollowStats(targetUserId)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [targetUserId]);

  const isSelf = me?.username === targetUsername;
  if (isSelf) return null;

  async function toggle() {
    if (!me) {
      alert("请先登录");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = stats?.is_following
        ? await unfollowUser(targetUserId)
        : await followUser(targetUserId);
      setStats(next);
    } catch (err) {
      if (err instanceof APIError) {
        setError(ERROR_MESSAGES[err.code] ?? err.message);
      } else {
        setError("操作失败");
      }
    } finally {
      setBusy(false);
    }
  }

  const following = stats?.is_following ?? false;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`rounded-md px-4 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
          following
            ? "border border-border bg-card text-foreground hover:bg-accent"
            : "bg-primary text-primary-foreground hover:opacity-90"
        }`}
      >
        {busy ? "处理中…" : following ? "已关注" : "+ 关注"}
      </button>
      {error && (
        <span className="text-[11px] text-rose-600 dark:text-rose-400">{error}</span>
      )}
    </div>
  );
}

export function FollowCounts({ targetUserId }: { targetUserId: number }) {
  const [stats, setStats] = useState<FollowStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFollowStats(targetUserId)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [targetUserId]);

  return (
    <span className="inline-flex items-center gap-3 text-xs text-muted-foreground">
      <span>
        粉丝 <span className="font-mono text-foreground">{stats?.followers ?? "—"}</span>
      </span>
      <span>
        关注 <span className="font-mono text-foreground">{stats?.following ?? "—"}</span>
      </span>
    </span>
  );
}
