"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useLinksPolicy } from "@/components/links/LinksPolicyProvider";

export default function RedirectPage() {
  return (
    <Suspense fallback={null}>
      <RedirectInner />
    </Suspense>
  );
}

function RedirectInner() {
  const router = useRouter();
  const params = useSearchParams();
  const policy = useLinksPolicy();
  const raw = params.get("url") ?? "";

  const parsed = useMemo(() => parseTarget(raw), [raw]);

  // User has to click — no auto-redirect. A passive countdown is fine
  // (shows the user they're not stuck), but we never navigate on our
  // own because that's the whole point of an interstitial.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setNow(Date.now() - started), 100);
    return () => clearInterval(t);
  }, []);
  const secondsShown = Math.floor(now / 1000);

  if (!parsed) {
    return (
      <InterstitialShell>
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-700 dark:text-rose-300">
          链接无效或缺失 <code className="font-mono">url</code> 参数。请返回上一页重试。
        </div>
        <BackToSafetyButton router={router} />
      </InterstitialShell>
    );
  }

  const { href, host, protocol } = parsed;

  // If the target is same-origin or whitelisted, this page was reached
  // by accident (e.g. hand-typed URL). Show a short "you probably
  // meant this" and auto-push without the interstitial chrome.
  const sameOrigin = policy.selfHost && host === policy.selfHost;
  const whitelisted = policy.trustedDomains.some(
    (d) => host === d || host.endsWith("." + d),
  );

  if (sameOrigin || whitelisted) {
    return (
      <InterstitialShell>
        <p className="text-sm text-muted-foreground">
          该地址属于{sameOrigin ? "本站" : "可信白名单"}，正在直接跳转…
        </p>
        <a
          href={href}
          className="mt-4 inline-block rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          rel="noopener"
        >
          立即前往
        </a>
      </InterstitialShell>
    );
  }

  return (
    <InterstitialShell>
      <div className="mb-4 text-sm text-muted-foreground">
        你即将离开本站，前往以下第三方地址。请确认链接无误后再继续。
      </div>
      <div className="mb-1 rounded-md border border-border bg-card px-4 py-3">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          目标站点
        </div>
        <div className="break-all font-mono text-sm font-semibold text-foreground">
          {host}
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          完整地址
        </div>
        <div className="mt-0.5 break-all font-mono text-[12px] text-muted-foreground">
          {href}
        </div>
      </div>
      {protocol === "http:" && (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          ⚠ 这是非加密的 HTTP 链接，传输内容可能被中间人窥探,请谨慎。
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          继续前往 ({secondsShown}s)
        </a>
        <BackToSafetyButton router={router} />
      </div>
      <p className="mt-5 text-[11px] text-muted-foreground">
        链接由其他用户发布,本站不对其内容负责。点击「继续前往」将以新窗口打开目标页面。
      </p>
    </InterstitialShell>
  );
}

function InterstitialShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15 text-lg">
          ↗
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">即将跳转到站外链接</h1>
          <p className="text-xs text-muted-foreground">External link notice</p>
        </div>
      </div>
      {children}
      <div className="mt-8 text-center text-[11px] text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          ← 返回首页
        </Link>
      </div>
    </div>
  );
}

function BackToSafetyButton({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="rounded-md border border-border bg-card px-5 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      返回上一页
    </button>
  );
}

// parseTarget accepts only http(s) URLs. Anything else — javascript:,
// data:, file:, relative paths, malformed — is rejected so the
// interstitial can never be used to hand a user a dangerous scheme.
function parseTarget(raw: string): { href: string; host: string; protocol: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    return { href: u.toString(), host: u.host.toLowerCase(), protocol: u.protocol };
  } catch {
    return null;
  }
}
