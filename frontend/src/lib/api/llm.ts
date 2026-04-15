import { api } from "@/lib/api-client";

export type LLMCallStatus = "success" | "error";

export interface ServerLLMCall {
  id: number;
  provider: string;
  model: string;
  feature: string;
  status: LLMCallStatus;
  latency_ms: number;
  request_chars: number;
  response_chars: number;
  error_message?: string;
  created_at: string;
}

export interface LLMStatRow {
  provider: string;
  model: string;
  calls: number;
  errors: number;
  avg_latency_ms: number;
  total_req_chars: number;
  total_resp_chars: number;
}

export interface LLMListParams {
  provider?: string;
  model?: string;
  feature?: string;
  status?: LLMCallStatus;
  limit?: number;
  offset?: number;
}

export interface LLMListResp {
  items: ServerLLMCall[];
  total: number;
}

export function adminListLLMCalls(params: LLMListParams = {}) {
  const q = new URLSearchParams();
  if (params.provider) q.set("provider", params.provider);
  if (params.model) q.set("model", params.model);
  if (params.feature) q.set("feature", params.feature);
  if (params.status) q.set("status", params.status);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  const qs = q.toString();
  return api<LLMListResp>(`/api/admin/llm/calls${qs ? `?${qs}` : ""}`);
}

export function adminGetLLMStats() {
  return api<{ items: LLMStatRow[] }>("/api/admin/llm/stats");
}

export function adminGetLLMProviders() {
  return api<{ providers: string[] }>("/api/admin/llm/providers");
}
