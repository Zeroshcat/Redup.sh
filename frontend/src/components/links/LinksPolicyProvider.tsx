"use client";

import { createContext, useContext, useMemo } from "react";

export interface LinksPolicy {
  // Backend site.links.external_warn_enabled. When true, clicks on
  // non-trusted off-site links are routed through /redirect for a
  // confirmation interstitial.
  warnEnabled: boolean;
  // Lower-cased hostnames treated as "trusted": still opened in a new
  // tab, still tagged nofollow, but no interstitial.
  trustedDomains: string[];
  // The site's own host (derived from NEXT_PUBLIC_SITE_URL). Kept on
  // the policy so the renderer's same-origin check and the interstitial
  // share one source of truth.
  selfHost: string;
  // previewsEnabled mirrors site.links.preview_enabled. When false the
  // renderer skips LinkCard entirely — no skeleton, no network round-trip.
  previewsEnabled: boolean;
}

const DefaultPolicy: LinksPolicy = {
  warnEnabled: false,
  trustedDomains: [],
  selfHost: "",
  previewsEnabled: false,
};

const LinksPolicyContext = createContext<LinksPolicy>(DefaultPolicy);

export function LinksPolicyProvider({
  value,
  children,
}: {
  value: LinksPolicy;
  children: React.ReactNode;
}) {
  // Freeze the shape once per render so referential equality holds
  // across children — cheap but lets downstream memo hooks skip work.
  const memo = useMemo(
    () => ({
      warnEnabled: value.warnEnabled,
      trustedDomains: value.trustedDomains,
      selfHost: value.selfHost,
      previewsEnabled: value.previewsEnabled,
    }),
    [value.warnEnabled, value.trustedDomains, value.selfHost, value.previewsEnabled],
  );
  return <LinksPolicyContext.Provider value={memo}>{children}</LinksPolicyContext.Provider>;
}

export function useLinksPolicy(): LinksPolicy {
  return useContext(LinksPolicyContext);
}

// classifyHref is the pure function the renderer uses to decide what
// to do with a given href. Exported so tests (or the interstitial's
// own back-to-safety logic) can reuse it.
export type HrefKind = "internal" | "external-trusted" | "external-warn";

export function classifyHref(href: string | undefined, policy: LinksPolicy): HrefKind {
  if (!href) return "internal";
  if (!/^https?:\/\//i.test(href)) return "internal";
  let host = "";
  try {
    host = new URL(href).host.toLowerCase();
  } catch {
    // Malformed URL — treat as warn-worthy external; the interstitial
    // will refuse to follow it anyway.
    return policy.warnEnabled ? "external-warn" : "external-trusted";
  }
  if (policy.selfHost && host === policy.selfHost) return "internal";
  if (policy.trustedDomains.some((d) => host === d || host.endsWith("." + d))) {
    return "external-trusted";
  }
  return policy.warnEnabled ? "external-warn" : "external-trusted";
}

// buildInterstitialHref produces the /redirect URL for a given target.
// Kept in one place so the renderer and any future inline buttons
// agree on the query shape.
export function buildInterstitialHref(target: string): string {
  return `/redirect?url=${encodeURIComponent(target)}`;
}
