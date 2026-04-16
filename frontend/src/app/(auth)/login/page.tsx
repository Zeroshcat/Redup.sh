"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api/auth";
import { APIError } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = account.trim().length > 0 && password.length >= 8;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setError(null);
    setLoading(true);
    try {
      const session = await login({ login: account.trim(), password });
      setUser(session.user);
      router.push("/");
    } catch (err) {
      if (err instanceof APIError) {
        setError(formatError(err));
      } else {
        setError("无法连接到服务器");
      }
    } finally {
      setLoading(false);
    }
  }

  function formatError(err: APIError): string {
    const msg = errorMessage(err);
    return err.requestId ? `${msg} (req ${err.requestId})` : msg;
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="mb-1 text-2xl font-bold text-foreground">欢迎回来</h1>
        <p className="text-sm text-muted-foreground">
          登录你的 Redup 账号，继续社区讨论
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              用户名或邮箱
            </label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="your@email.com"
              autoComplete="username"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-xs font-medium text-muted-foreground">
                密码
              </label>
              <Link
                href="/forgot"
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                忘记密码？
              </Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位"
              autoComplete="current-password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            记住我 7 天
          </label>

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
            {loading ? "登录中…" : "登录"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[11px] text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>或使用以下方式</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <SocialBtn label="GitHub" icon="⬢" />
          <SocialBtn label="Google" icon="G" />
          <SocialBtn label="微信" icon="💬" />
        </div>
      </div>

      <div className="mt-5 text-center text-sm text-muted-foreground">
        还没有账号？{" "}
        <Link href="/register" className="font-medium text-foreground hover:underline">
          立即注册
        </Link>
      </div>
    </div>
  );
}

function errorMessage(err: APIError): string {
  switch (err.code) {
    case "invalid_credential":
      return "用户名或密码错误";
    case "account_disabled":
      return "账号已被禁用，请联系管理员";
    case "bad_request":
      return "请求格式错误";
    default:
      return err.message || "登录失败";
  }
}

function SocialBtn({ label, icon }: { label: string; icon: string }) {
  return (
    <button
      type="button"
      className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-card py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}
