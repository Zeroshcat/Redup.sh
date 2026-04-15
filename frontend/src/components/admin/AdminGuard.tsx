"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";

/**
 * Client-side admin gate. Renders children only if the current user has the
 * admin role; otherwise redirects. Mounted in the admin layout so every
 * /admin/* route is covered.
 *
 * NOTE: this is UX protection only. Real security is enforced on the backend
 * via rbac.RequireRole(RoleAdmin) — a malicious user bypassing this guard
 * still can't call admin APIs without an admin JWT.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "admin") {
      router.replace("/");
    }
  }, [hydrated, user, router]);

  if (!hydrated) {
    return <FullscreenPlaceholder text="检查权限中…" />;
  }
  if (!user) {
    return <FullscreenPlaceholder text="正在跳转到登录页…" />;
  }
  if (user.role !== "admin") {
    return (
      <FullscreenPlaceholder
        text="无权访问"
        subtitle="此页面仅管理员可见，正在返回首页"
      />
    );
  }

  return <>{children}</>;
}

function FullscreenPlaceholder({
  text,
  subtitle,
}: {
  text: string;
  subtitle?: string;
}) {
  return (
    <div className="flex h-screen flex-1 flex-col items-center justify-center px-4 text-center">
      <div className="mb-2 text-lg font-semibold text-foreground">{text}</div>
      {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
    </div>
  );
}
