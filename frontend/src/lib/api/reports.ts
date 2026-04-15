import { api } from "@/lib/api-client";

export type ReportTargetType = "topic" | "post" | "user";
export type ReportReason = "spam" | "harassment" | "illegal" | "privacy" | "other";
export type ReportStatus = "pending" | "resolved" | "dismissed";

export interface ServerReport {
  id: number;
  reporter_user_id: number;
  reporter_username: string;
  target_type: ReportTargetType;
  target_id: number;
  target_title: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  handler_user_id?: number;
  handler_username?: string;
  resolution_note?: string;
  handled_at?: string;
  created_at: string;
}

export interface ReportCounts {
  pending: number;
  resolved: number;
  dismissed: number;
  all: number;
}

export interface SubmitReportInput {
  target_type: ReportTargetType;
  target_id: number;
  target_title: string;
  reason: ReportReason;
  description?: string;
}

export function submitReport(input: SubmitReportInput) {
  return api<ServerReport>("/api/reports", { method: "POST", body: input });
}

export function listReports(status: ReportStatus | "all" = "pending", limit = 50) {
  const q = new URLSearchParams();
  if (status !== "all") q.set("status", status);
  q.set("limit", String(limit));
  return api<ServerReport[]>(`/api/admin/reports?${q.toString()}`);
}

export function getReportCounts() {
  return api<ReportCounts>("/api/admin/reports/counts");
}

export function resolveReport(id: number, note = "") {
  return api<ServerReport>(`/api/admin/reports/${id}/resolve`, {
    method: "POST",
    body: { note },
  });
}

export function dismissReport(id: number, note = "") {
  return api<ServerReport>(`/api/admin/reports/${id}/dismiss`, {
    method: "POST",
    body: { note },
  });
}
