"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { sendVerificationEmail, verifyEmail } from "@/lib/api/auth";
import { APIError, getAccessToken } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);

  const initialEmail = params.get("email") ?? "";
  const fromLogin = params.get("from") === "login";

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Cooldown counter for the resend button. The backend enforces a
  // 60s cooldown and returns 429 / resend_too_soon if the caller
  // jumps the gun — the UI just mirrors it so the button feels right.
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCooldown(seconds: number) {
    setCooldown(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Auto-fire a code on first visit if we know the email. Registration
  // redirects here right after the backend fires the first one itself,
  // so this second call will simply land on the 60s cooldown — the UI
  // handles that gracefully and shows the timer.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (autoSentRef.current) return;
    if (!initialEmail) return;
    autoSentRef.current = true;
    doSend(initialEmail, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEmail]);

  async function doSend(targetEmail: string, silent = false) {
    if (cooldown > 0 || loading) return;
    setError(null);
    if (!silent) setInfo(null);
    try {
      await sendVerificationEmail(targetEmail);
      if (!silent) setInfo(`验证码已发送至 ${targetEmail},请查收(含垃圾邮件箱)`);
      startCooldown(60);
    } catch (err) {
      if (err instanceof APIError) {
        if (err.code === "resend_too_soon") {
          // Conservative fallback: backend TTL is 60s, we don't know
          // the exact remaining, so show a 60s counter.
          startCooldown(60);
          if (!silent) setInfo("请稍候再试,每 60 秒才能重新发送一次");
        } else if (!silent) {
          setError(errorMessage(err));
        }
      } else if (!silent) {
        setError("发送失败,请检查网络");
      }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setError("验证码必须是 6 位数字");
      return;
    }
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await verifyEmail(email.trim(), trimmed);
      setUser(res.user);
      // If the user arrived via /login (403 path), they don't have a
      // valid session yet — bounce back to login. Otherwise they came
      // from register with live tokens and can go straight to /.
      const hasSession = !!getAccessToken();
      if (fromLogin || !hasSession) {
        router.push("/login");
      } else {
        router.push("/");
      }
    } catch (err) {
      if (err instanceof APIError) {
        setError(errorMessage(err));
      } else {
        setError("验证失败,请检查网络");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 text-center">
        <h1 className="mb-1 text-2xl font-bold text-foreground">验证你的邮箱</h1>
        <p className="text-sm text-muted-foreground">
          我们向你的邮箱发送了一封包含 6 位验证码的邮件
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
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

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              验证码
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6 位数字"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              className="w-full rounded-md border border-input bg-background px-3 py-3 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-ring"
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}
          {info && !error && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6 || !email}
            className="w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {loading ? "验证中…" : "验证邮箱"}
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => doSend(email)}
            disabled={cooldown > 0 || !email}
            className="text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            {cooldown > 0 ? `${cooldown}s 后可重新发送` : "重新发送验证码"}
          </button>
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            返回登录
          </Link>
        </div>
      </div>

      <div className="mt-5 text-center text-xs text-muted-foreground">
        没收到邮件?请检查垃圾邮件箱,或联系管理员确认 SMTP 已配置。
      </div>
    </div>
  );
}

function errorMessage(err: APIError): string {
  switch (err.code) {
    case "invalid_verification_code":
      return "验证码错误或已过期";
    case "email_already_verified":
      return "该邮箱已验证,请直接登录";
    case "resend_too_soon":
      return "请稍候再试,每 60 秒才能重新发送一次";
    case "mail_not_configured":
      return "站点尚未配置邮件服务,请联系管理员";
    case "invalid_email":
      return "邮箱格式不正确";
    case "bad_request":
      return "请求格式错误";
    default:
      return err.message || "操作失败";
  }
}
