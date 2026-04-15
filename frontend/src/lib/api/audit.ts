import { api } from "@/lib/api-client";

export interface ServerAuditLog {
  id: number;
  actor_user_id: number;
  actor_username: string;
  action: string;
  target_type: string;
  target_id: number;
  target_label: string;
  detail?: string;
  ip?: string;
  created_at: string;
}

export interface AuditListResp {
  items: ServerAuditLog[];
  total: number;
}

export interface AuditListParams {
  action?: string;
  target_type?: string;
  actor_id?: number;
  limit?: number;
  offset?: number;
}

export function listAuditLogs(params: AuditListParams = {}) {
  const q = new URLSearchParams();
  if (params.action) q.set("action", params.action);
  if (params.target_type) q.set("target_type", params.target_type);
  if (params.actor_id) q.set("actor_id", String(params.actor_id));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  const qs = q.toString();
  return api<AuditListResp>(`/api/admin/audit${qs ? `?${qs}` : ""}`);
}
