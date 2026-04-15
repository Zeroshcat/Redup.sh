import { api } from "@/lib/api-client";
import { apiServer, ServerAPIError } from "./server";
import type { ServerPost, ServerTopic } from "./forum";
import { adaptPost, adaptTopic } from "./forum-adapter";

export interface ServerPublicUser {
  id: number;
  username: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  website?: string;
  level: number;
  xp?: number;
  role: string;
  status?: string;
  credit_score: number;
  joined_at: string;
}

export interface AdminUserListResp {
  items: ServerPublicUser[];
  total: number;
}

export interface AdminListUsersParams {
  search?: string;
  role?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export function adminListUsers(params: AdminListUsersParams = {}) {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.role) q.set("role", params.role);
  if (params.status) q.set("status", params.status);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  const qs = q.toString();
  return api<AdminUserListResp>(`/api/admin/users${qs ? `?${qs}` : ""}`);
}

export async function fetchPublicUser(username: string) {
  try {
    return await apiServer<ServerPublicUser>(`/api/users/${username}`);
  } catch (err) {
    if (err instanceof ServerAPIError && err.status === 404) return null;
    throw err;
  }
}

export async function fetchUserTopics(username: string, limit = 30) {
  try {
    const items = await apiServer<ServerTopic[]>(
      `/api/users/${username}/topics?limit=${limit}`,
    );
    return items.map(adaptTopic);
  } catch (err) {
    if (err instanceof ServerAPIError && err.status === 404) return [];
    throw err;
  }
}

export async function fetchUserPosts(username: string, limit = 30) {
  try {
    const items = await apiServer<ServerPost[]>(
      `/api/users/${username}/posts?limit=${limit}`,
    );
    return items.map(adaptPost);
  } catch (err) {
    if (err instanceof ServerAPIError && err.status === 404) return [];
    throw err;
  }
}

export function adminBanUser(id: number) {
  return api<ServerPublicUser>(`/api/admin/users/${id}/ban`, { method: "POST" });
}

export function adminUnbanUser(id: number) {
  return api<ServerPublicUser>(`/api/admin/users/${id}/unban`, { method: "POST" });
}

export interface AdjustCreditScoreResp {
  user_id: number;
  credit_score: number;
}

export function adminAdjustCreditScore(
  id: number,
  delta: number,
  reason: string,
) {
  return api<AdjustCreditScoreResp>(`/api/admin/users/${id}/credit-score`, {
    method: "POST",
    body: { delta, reason },
  });
}
