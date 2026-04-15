import { api } from "@/lib/api-client";

export type NotificationKind = "reply" | "like" | "mention" | "follow" | "system";

export interface ServerNotification {
  id: number;
  recipient_id: number;
  type: NotificationKind;
  actor_user_id: number;
  actor_username: string;
  actor_is_anon: boolean;
  target_type?: string;
  target_id?: number;
  target_title?: string;
  text: string;
  preview?: string;
  read: boolean;
  created_at: string;
}

export interface ListParams {
  type?: NotificationKind;
  unread?: boolean;
  limit?: number;
  offset?: number;
}

export function listNotifications(params: ListParams = {}) {
  const q = new URLSearchParams();
  if (params.type) q.set("type", params.type);
  if (params.unread) q.set("unread", "1");
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  const qs = q.toString();
  return api<ServerNotification[]>(`/api/notifications${qs ? `?${qs}` : ""}`);
}

export function getUnreadCount() {
  return api<{ unread: number }>(`/api/notifications/unread-count`);
}

export function markNotificationRead(id: number) {
  return api<{ ok: true }>(`/api/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
  return api<{ ok: true }>(`/api/notifications/read-all`, { method: "POST" });
}

// ---------- Admin ----------

export interface AdminListNotificationsParams {
  recipient_id?: number;
  actor_id?: number;
  type?: NotificationKind;
  unread?: boolean;
  limit?: number;
  offset?: number;
}

export interface AdminNotificationsResp {
  items: ServerNotification[];
  total: number;
}

export interface NotificationTypeStat {
  type: NotificationKind;
  count: number;
  unread: number;
}

export function adminListNotifications(params: AdminListNotificationsParams = {}) {
  const q = new URLSearchParams();
  if (params.recipient_id) q.set("recipient_id", String(params.recipient_id));
  if (params.actor_id) q.set("actor_id", String(params.actor_id));
  if (params.type) q.set("type", params.type);
  if (params.unread) q.set("unread", "1");
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  const qs = q.toString();
  return api<AdminNotificationsResp>(`/api/admin/notifications${qs ? `?${qs}` : ""}`);
}

export function adminGetNotificationStats() {
  return api<{ items: NotificationTypeStat[] }>("/api/admin/notifications/stats");
}
