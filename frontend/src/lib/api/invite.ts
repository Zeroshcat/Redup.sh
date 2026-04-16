import { api } from "@/lib/api-client";

export interface ServerInviteCode {
  id: number;
  code: string;
  creator_id: number;
  creator_name?: string;
  max_uses: number;
  used_count: number;
  note?: string;
  expires_at?: string;
  created_at: string;
}

export interface InviteListResp {
  items: ServerInviteCode[];
  total: number;
}

export interface ServerInviteUsage {
  id: number;
  code_id: number;
  user_id: number;
  username: string;
  redeemed_at: string;
}

export function adminListInvites(limit = 50, offset = 0) {
  return api<InviteListResp>(`/api/admin/invites?limit=${limit}&offset=${offset}`);
}

export function adminGenerateInvite(input: {
  max_uses?: number;
  note?: string;
  expires_in_hours?: number;
}) {
  return api<ServerInviteCode>("/api/admin/invites", {
    method: "POST",
    body: input,
  });
}

export function adminGetInviteUsages(id: number) {
  return api<ServerInviteUsage[]>(`/api/admin/invites/${id}/usages`);
}

export function adminDeleteInvite(id: number) {
  return api<void>(`/api/admin/invites/${id}`, { method: "DELETE" });
}
