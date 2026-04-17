"use client";

import Link from "next/link";
import { useState } from "react";
import { forgotPassword } from "@/lib/api/auth";
import { APIError } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailOk || loading) return;
    setError(null);
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      if (err instanceof APIError) {
        if (err.code === "mail_not_configured") {
          setError("站点尚未配置邮件服务,请联系管理员。");
        } else {
          setError(err.message || "发送失败");
        }
      } else {
        setError("无法连接到服务器");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="mb-1 text-2xl font-bold text-foreground">找回密码</h1>
        <p className="text-sm text-muted-foreground">
          输入注册邮箱,我们将给你发送一封密码重置邮件
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        {sent ? (
          <div className="space-y-3 text-sm text-foreground">
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              ✓ 如果该邮箱对应一个已注册账号,你会在几分钟内收到一封重置邮件。
            </p>
            <p className="text-xs text-muted-foreground">
              没收到?请检查垃圾邮件箱,或 60 秒后再次尝试。
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSent(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                用不同的邮箱重试
              </button>
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
              />
            </div>

            {error && (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!emailOk || loading}
              className="w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {loading ? "发送中…" : "发送重置邮件"}
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
