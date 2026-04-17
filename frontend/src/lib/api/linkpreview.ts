import { api, APIError } from "@/lib/api-client";

// Wire shape mirrors backend internal/linkpreview/service.go Preview.
export interface LinkPreview {
  url: string;
  canonical_url?: string;
  title?: string;
  description?: string;
  image_url?: string;
  site_name?: string;
  favicon_url?: string;
  fetched_at: string;
  // True when the host matched the admin denylist. The frontend
  // renders a muted "站点已被屏蔽" card instead of making another
  // attempt.
  blocked?: boolean;
}

// In-flight dedup: two LinkCard components mounting with the same URL
// in the same tab share one request. Map entry is cleared on settle
// so a later remount still re-fetches (follows the server's TTL).
const inflight = new Map<string, Promise<LinkPreview>>();

export function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const pending = inflight.get(url);
  if (pending) return pending;
  const p = api<LinkPreview>(`/api/link-preview?url=${encodeURIComponent(url)}`, {
    method: "GET",
  }).finally(() => {
    inflight.delete(url);
  });
  inflight.set(url, p);
  return p;
}

// isPreviewableError marks failures the card should swallow (fall
// back to a plain link). 503/403/400/502 all imply "no card today" —
// the user still sees the underlying anchor.
export function isPreviewableError(err: unknown): err is APIError {
  return err instanceof APIError;
}
