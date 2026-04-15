"use client";

import Link from "next/link";
import { useAuthStore } from "@/store/auth";

// TopicContentGuard renders children only when the current viewer is
// allowed to read the topic. Allowed = no restriction, OR viewer is the
// author, OR viewer is staff, OR viewer's level >= minReadLevel.
//
// Security note: this gate is enforced client-side only because our SSR
// path has no access to the user's auth token (stored in localStorage).
// A determined visitor can still bypass it via direct API calls. This is
// a UX-level limit, not a hard security boundary — if you need the
// latter, migrate auth to HTTP-only cookies so SSR can see the caller.
export function TopicContentGuard({
  minReadLevel,
  authorId,
  children,
}: {
  minReadLevel: number;
  authorId?: number;
  children: React.ReactNode;
}) {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  if (!minReadLevel || minReadLevel <= 0) {
    return <>{children}</>;
  }

  // Don't flash the lock during auth hydration — show children until we
  // know for sure. If the viewer turns out to be unauthorized the guard
  // will swap to the lock card on the next render.
  if (!hydrated) {
    return <>{children}</>;
  }

  const isAuthor = !!user && authorId !== undefined && user.id === authorId;
  const isStaff = !!user && (user.role === "admin" || user.role === "moderator");
  const meetsLevel = !!user && user.level >= minReadLevel;

  if (isAuthor || isStaff || meetsLevel) {
    return <>{children}</>;
  }

  return (
    <div className="my-6 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-center">
      <div className="mb-2 text-3xl">🔒</div>
      <p className="mb-1 text-sm font-semibold text-foreground">
        此帖需要 Lv.{minReadLevel} 或以上才能阅读
      </p>
      <p className="text-xs text-muted-foreground">
        {user
          ? `你当前等级 Lv.${user.level}，继续参与社区即可升级`
          : "登录并提升等级后再来查看"}
      </p>
      {!user && (
        <Link
          href="/login"
          className="mt-4 inline-block rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
        >
          去登录
        </Link>
      )}
    </div>
  );
}
