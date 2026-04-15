import { api } from "@/lib/api-client";

export type Verdict = "pass" | "warn" | "block";

export interface ServerModerationLog {
  id: number;
  target_type: string;
  target_id?: number;
  content_hash: string;
  content_excerpt: string;
  verdict: Verdict;
  reason?: string;
  provider: string;
  model: string;
  latency_ms: number;
  actor_user_id: number;
  actor_username?: string;
  blocked_action: boolean;
  resolved: boolean;
  created_at: string;
}

export interface ModerationListResp {
  items: ServerModerationLog[];
  total: number;
}

export function adminListModerationLogs(verdict?: Verdict, limit = 100) {
  const q = new URLSearchParams();
  if (verdict) q.set("verdict", verdict);
  q.set("limit", String(limit));
  return api<ModerationListResp>(`/api/admin/moderation?${q.toString()}`);
}

export function adminGetModerationCounts() {
  return api<Record<Verdict, number>>("/api/admin/moderation/counts");
}

export function adminResolveModerationLog(id: number) {
  return api<{ ok: true }>(`/api/admin/moderation/${id}/resolve`, { method: "POST" });
}
