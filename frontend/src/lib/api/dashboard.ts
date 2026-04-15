import { api } from "@/lib/api-client";
import type { ServerAuditLog } from "./audit";
import type { ServerBot, ServerBotCallLog } from "./bot";
import type { ServerReport } from "./reports";

export interface DashboardCounts {
  users: number;
  topics: number;
  bots: number;
  pending_reports: number;
  pending_bots: number;
  failed_bot_calls: number;
}

export interface DashboardResponse {
  counts: DashboardCounts;
  pending_reports: ServerReport[];
  pending_bots: ServerBot[];
  failed_bot_calls: ServerBotCallLog[];
  recent_audit: ServerAuditLog[];
}

export function getAdminDashboard() {
  return api<DashboardResponse>("/api/admin/dashboard");
}
