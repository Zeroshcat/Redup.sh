import { api } from "@/lib/api-client";

export interface ServerConversation {
  id: number;
  user_a_id: number;
  user_b_id: number;
  last_message_at: string;
  last_message_excerpt: string;
  last_sender_id: number;
  created_at: string;
  other_user_id: number;
  other_username: string;
  unread_count: number;
}

export interface ServerMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  read_at?: string;
  created_at: string;
}

export interface ServerConversationDetail {
  conversation: {
    id: number;
    user_a_id: number;
    user_b_id: number;
    last_message_at: string;
    last_message_excerpt: string;
    last_sender_id: number;
    created_at: string;
  };
  messages: ServerMessage[];
}

export function listConversations() {
  return api<ServerConversation[]>("/api/messages/conversations");
}

export function getMessages(otherID: number, before?: number) {
  const q = new URLSearchParams();
  if (before) q.set("before", String(before));
  const qs = q.toString();
  return api<ServerConversationDetail>(
    `/api/messages/conversations/${otherID}/messages${qs ? `?${qs}` : ""}`,
  );
}

export function sendMessage(otherID: number, content: string) {
  return api<{ conversation: ServerConversationDetail["conversation"]; message: ServerMessage }>(
    `/api/messages/conversations/${otherID}`,
    { method: "POST", body: { content } },
  );
}

export function markConversationRead(otherID: number) {
  return api<{ ok: true }>(`/api/messages/conversations/${otherID}/read`, {
    method: "POST",
  });
}

export function getUnreadMessageCount() {
  return api<{ unread: number }>("/api/messages/unread-count");
}

// ---------- Admin ----------

export interface AdminConversationSummary {
  id: number;
  user_a_id: number;
  user_b_id: number;
  user_a_username: string;
  user_b_username: string;
  last_message_at: string;
  last_message_excerpt: string;
  last_sender_id: number;
  created_at: string;
}

export interface AdminConversationListResp {
  items: AdminConversationSummary[];
  total: number;
}

export interface AdminConversationDetail extends AdminConversationSummary {
  messages: ServerMessage[];
}

export interface AdminListConversationsParams {
  participant_id?: number;
  limit?: number;
  offset?: number;
}

export function adminListConversations(params: AdminListConversationsParams = {}) {
  const q = new URLSearchParams();
  if (params.participant_id) q.set("participant_id", String(params.participant_id));
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  const qs = q.toString();
  return api<AdminConversationListResp>(
    `/api/admin/messages/conversations${qs ? `?${qs}` : ""}`,
  );
}

export function adminGetConversationDetail(id: number) {
  return api<AdminConversationDetail>(`/api/admin/messages/conversations/${id}`);
}
