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
  // topic_id + post_floor are the authoritative routing fields — the
  // frontend builds /topic/{topic_id}#floor-{post_floor} from them.
  // target_id / target_type are kept only for display and legacy
  // callers; clicking a notification should never key off target_id.
  topic_id?: number;
  post_floor?: number;
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

// notificationHref turns a notification row into the exact URL the
// user should land on when they click it. Routes always key off
// topic_id (+ optional post_floor anchor); target_id is never used
// here — it's a mix of topic_id and post_id depending on the source
// event, which is why the old code mis-routed post-scoped clicks.
// Legacy rows without topic_id collapse to /notifications so the
// user at least sees their list instead of a dead link.
export function notificationHref(n: ServerNotification): string {
  if (!n.topic_id) return "/notifications";
  const base = `/topic/${n.topic_id}`;
  return n.post_floor ? `${base}#floor-${n.post_floor}` : base;
}
