import { api } from "@/lib/api-client";

export type WordSeverity = "block" | "warn";

export interface ServerFilterWord {
  id: number;
  word: string;
  severity: WordSeverity;
  note?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface FilterWordInput {
  word: string;
  severity: WordSeverity;
  note?: string;
  enabled?: boolean;
}

export function adminListFilterWords() {
  return api<ServerFilterWord[]>("/api/admin/content-filter");
}

export function adminCreateFilterWord(input: FilterWordInput) {
  return api<ServerFilterWord>("/api/admin/content-filter", {
    method: "POST",
    body: input,
  });
}

export function adminUpdateFilterWord(id: number, input: FilterWordInput) {
  return api<ServerFilterWord>(`/api/admin/content-filter/${id}`, {
    method: "PUT",
    body: input,
  });
}

export function adminDeleteFilterWord(id: number) {
  return api<{ ok: true }>(`/api/admin/content-filter/${id}`, {
    method: "DELETE",
  });
}
