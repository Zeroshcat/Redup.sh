"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { resetPassword } from "@/lib/api/auth";
import { APIError } from "@/lib/api-client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const passwordOk = password.length >= 8;
  const match = password === confirm;
  const canSubmit = passwordOk && match && token.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setError(null);
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
    } catch (err) {
      if (err instanceof APIError) {
        setError(errorMessage(err));
      } else {
        setError("无法连接到服务器");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-600 dark:text-rose-400">
          链接无效:缺少 token 参数。请使用邮件中完整的链接打开。
        </div>
        <div className="mt-5 text-center text-sm">
          <Link href="/forgot" className="font-medium text-foreground hover:underline">
            重新申请
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="mb-1 text-2xl font-bold text-foreground">设置新密码</h1>
        <p className="text-sm text-muted-foreground">
          链接 1 小时内有效,完成后请使用新密码登录
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        {done ? (
          <div className="space-y-3 text-center">
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              ✓ 密码已更新,即将跳转登录页…
            </p>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                新密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位"
                autoComplete="new-password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                确认新密码
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="再输入一次"
                autoComplete="new-password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
              {confirm && !match && (
                <p className="mt-1 text-[11px] text-red-600">两次输入的密码不一致</p>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {loading ? "保存中…" : "更新密码"}
            </button>
          </form>
        )}
      </div>

      <div className="mt-5 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground hover:underline">
          ← 返回登录
        </Link>
      </div>
    </div>
  );
}

function errorMessage(err: APIError): string {
  switch (err.code) {
    case "reset_token_invalid":
      return "重置链接已失效或已被使用,请重新申请";
    case "weak_password":
      return "新密码至少 8 位";
    default:
      return err.message || "重置失败";
  }
}
