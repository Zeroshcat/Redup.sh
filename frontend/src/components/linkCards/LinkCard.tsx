"use client";

import { useEffect, useState } from "react";
import {
  buildInterstitialHref,
  classifyHref,
  useLinksPolicy,
} from "@/components/links/LinksPolicyProvider";
import { fetchLinkPreview, type LinkPreview } from "@/lib/api/linkpreview";

// LinkCard is the Discourse-style rich preview rendered in place of a
// bare URL when it stands alone on its own line. On mount it pulls
// the OG metadata from /api/link-preview (which is server-cached),
// shows a skeleton while the request is in flight, and falls back to
// a plain anchor on any failure so broken upstreams never leave an
// ugly error card in the post body.
export function LinkCard({ url }: { url: string }) {
  const policy = useLinksPolicy();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; data: LinkPreview }
    | { kind: "failed" }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchLinkPreview(url)
      .then((data) => {
        if (cancelled) return;
        if (!data.title && !data.blocked) {
          // No title and not an admin-block — treat as a soft failure
          // and render the plain link instead.
          setState({ kind: "failed" });
          return;
        }
        setState({ kind: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Failure path: fall back to the same anchor shape the renderer
  // would have produced for an inline link, so the post still reads
  // fine and links still work.
  if (state.kind === "failed") {
    return <FallbackLink url={url} />;
  }

  if (state.kind === "loading") {
    return (
      <div className="my-4 animate-pulse rounded-lg border border-border bg-card p-4">
        <div className="mb-2 h-3 w-24 rounded bg-muted" />
        <div className="mb-2 h-5 w-3/4 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted/70" />
        <div className="mt-1 h-3 w-5/6 rounded bg-muted/70" />
      </div>
    );
  }

  const p = state.data;

  if (p.blocked) {
    return (
      <div className="my-4 rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        🚫 链接指向的站点已被管理员屏蔽预览:
        <a
          href={p.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="ml-1 text-foreground underline"
        >
          {hostOf(p.url)}
        </a>
      </div>
    );
  }

  // If the link policy says this host needs an interstitial, route
  // the card's click through /redirect the same way inline links
  // are. Same-origin / whitelisted targets get the direct href.
  const kind = classifyHref(p.url, policy);
  const href = kind === "external-warn" ? buildInterstitialHref(p.url) : p.url;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="group my-4 flex gap-3 overflow-hidden rounded-lg border border-border bg-card transition hover:border-primary/60 hover:bg-accent"
    >
      {p.image_url && (
        <div className="relative hidden w-44 shrink-0 overflow-hidden bg-muted sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        </div>
      )}
      <div className="min-w-0 flex-1 p-4">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {p.favicon_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.favicon_url}
              alt=""
              width={14}
              height={14}
              loading="lazy"
              className="h-3.5 w-3.5 rounded-sm"
            />
          )}
          <span className="truncate">{p.site_name || hostOf(p.url)}</span>
          <span aria-hidden="true" className="ml-auto">↗</span>
        </div>
        <div className="line-clamp-2 text-sm font-semibold text-foreground">
          {p.title}
        </div>
        {p.description && (
          <div className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
            {p.description}
          </div>
        )}
      </div>
    </a>
  );
}

function FallbackLink({ url }: { url: string }) {
  const policy = useLinksPolicy();
  const kind = classifyHref(url, policy);
  const isExternal = kind !== "internal";
  const href = kind === "external-warn" ? buildInterstitialHref(url) : url;
  return (
    <a
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer nofollow" : undefined}
      className="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
    >
      {url}
      {isExternal && (
        <span aria-hidden="true" className="ml-0.5 text-[0.8em] text-muted-foreground">
          ↗
        </span>
      )}
    </a>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
