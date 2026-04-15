import { api } from "@/lib/api-client";

export interface AnonAuditRow {
  anon_id: string;
  user_id: number;
  real_username: string;
  topic_id: number;
  topic_title: string;
  post_count: number;
  first_seen: string;
  last_seen: string;
}

interface AnonAuditListResp {
  items: AnonAuditRow[];
}

// adminSearchAnonAudit queries the anonymous audit trail. An empty query
// returns the most recent mappings (useful for browsing); a non-empty query
// is matched against anon id, real username, topic id, or topic title.
// Every call is recorded to the platform audit log by the backend — do not
// call this on keystroke, only on explicit user action.
export function adminSearchAnonAudit(query: string, limit = 100) {
  const q = new URLSearchParams();
  if (query) q.set("q", query);
  q.set("limit", String(limit));
  return api<AnonAuditListResp>(`/api/admin/anon/audit?${q.toString()}`);
}
