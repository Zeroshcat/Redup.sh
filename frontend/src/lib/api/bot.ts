import { api } from "@/lib/api-client";
import type { Bot } from "@/types";
import { apiServer, ServerAPIError } from "./server";

export type BotStatus = "pending" | "active" | "rejected" | "suspended";

export interface ServerBot {
  id: number;
  slug: string;
  name: string;
  description: string;
  avatar_url?: string;
  owner_user_id: number;
  owner_username?: string;
  model_provider: string;
  model_name: string;
  webhook_url?: string;
  system_prompt?: string;
  tags?: string;
  status: BotStatus;
  is_official: boolean;
  is_featured: boolean;
  is_moderator: boolean;
  call_count: number;
  like_count: number;
  rejection_note?: string;
  approved_by?: number;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface BotListResp {
  items: ServerBot[];
  total: number;
}

export interface BotInput {
  slug: string;
  name: string;
  description: string;
  avatar_url?: string;
  model_provider?: string;
  model_name?: string;
  webhook_url: string;
  api_key?: string;
  system_prompt?: string;
  tags?: string;
}

// ---------- Public (SSR + client) ----------

export async function fetchBots() {
  try {
    return await apiServer<BotListResp>("/api/bots?limit=100");
  } catch {
    return { items: [], total: 0 } as BotListResp;
  }
}

export async function fetchBotBySlug(slug: string) {
  try {
    return await apiServer<ServerBot>(`/api/bots/${slug}`);
  } catch (err) {
    if (err instanceof ServerAPIError && err.status === 404) return null;
    throw err;
  }
}

export function listBots() {
  return api<BotListResp>(`/api/bots?limit=100`, { auth: false });
}

// ---------- User (auth) ----------

export function createBot(input: BotInput) {
  return api<ServerBot>("/api/bots", { method: "POST", body: input });
}

export function updateBot(slug: string, input: BotInput) {
  return api<ServerBot>(`/api/bots/${slug}`, { method: "PUT", body: input });
}

export function deleteOwnBot(slug: string) {
  return api<{ ok: true }>(`/api/bots/${slug}`, { method: "DELETE" });
}

// ---------- Admin ----------

export function adminListBots(status?: BotStatus) {
  const q = status ? `?status=${status}` : "";
  return api<BotListResp>(`/api/admin/bots${q}`);
}

export function adminApproveBot(id: number) {
  return api<ServerBot>(`/api/admin/bots/${id}/approve`, { method: "POST" });
}

export function adminRejectBot(id: number, note: string) {
  return api<ServerBot>(`/api/admin/bots/${id}/reject`, { method: "POST", body: { note } });
}

export function adminSuspendBot(id: number, note: string) {
  return api<ServerBot>(`/api/admin/bots/${id}/suspend`, { method: "POST", body: { note } });
}

export function adminFeatureBot(id: number, featured: boolean) {
  return api<ServerBot>(`/api/admin/bots/${id}/feature`, {
    method: "POST",
    body: { featured },
  });
}

export function adminSetBotModerator(id: number, enabled: boolean) {
  return api<ServerBot>(`/api/admin/bots/${id}/moderator`, {
    method: "POST",
    body: { enabled },
  });
}

export function adminDeleteBot(id: number) {
  return api<{ ok: true }>(`/api/admin/bots/${id}`, { method: "DELETE" });
}

// ---------- Call logs ----------

export type BotCallStatus = "success" | "timeout" | "error" | "blocked";

export interface ServerBotCallLog {
  id: number;
  bot_id: number;
  bot_slug: string;
  bot_name: string;
  trigger_user_id: number;
  trigger_username?: string;
  topic_id: number;
  topic_title?: string;
  post_floor: number;
  status: BotCallStatus;
  latency_ms: number;
  request_summary?: string;
  response_summary?: string;
  error_message?: string;
  created_at: string;
}

export interface BotCallLogResp {
  items: ServerBotCallLog[];
  total: number;
}

export function adminListBotLogs(params: {
  status?: BotCallStatus;
  bot_slug?: string;
  limit?: number;
} = {}) {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.bot_slug) q.set("bot_slug", params.bot_slug);
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return api<BotCallLogResp>(`/api/admin/bot-logs${qs ? `?${qs}` : ""}`);
}

export function adminGetBotLogStats() {
  return api<Record<BotCallStatus, number>>("/api/admin/bot-logs/stats");
}

// ---------- API tokens (owner-managed) ----------

export interface ServerBotAPIToken {
  id: number;
  bot_id: number;
  name: string;
  prefix: string;
  scopes: string;
  last_used_at?: string;
  created_at: string;
}

export interface IssuedBotToken {
  token: string; // plaintext, only returned once at issue time
  row: ServerBotAPIToken;
}

export function listBotTokens(botSlug: string) {
  return api<ServerBotAPIToken[]>(`/api/bots/${botSlug}/tokens`);
}

export function issueBotToken(botSlug: string, name?: string) {
  return api<IssuedBotToken>(`/api/bots/${botSlug}/tokens`, {
    method: "POST",
    body: { name: name ?? "" },
  });
}

export function deleteBotToken(botSlug: string, tokenId: number) {
  return api<{ ok: true }>(`/api/bots/${botSlug}/tokens/${tokenId}`, {
    method: "DELETE",
  });
}

// ---------- Manual summon ----------

export function summonBot(topicId: number, botSlug: string) {
  return api<{ ok: true }>(`/api/topics/${topicId}/summon-bot`, {
    method: "POST",
    body: { bot_slug: botSlug },
  });
}

// ---------- Adapter ----------

export function adaptBot(s: ServerBot): Bot {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    avatarUrl: s.avatar_url,
    description: s.description,
    modelInfo: `${s.model_provider} · ${s.model_name}`,
    ownerUsername: s.owner_username ?? `user_${s.owner_user_id}`,
    callCount: Number(s.call_count) || 0,
    likeCount: Number(s.like_count) || 0,
    tags: s.tags
      ? s.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    status: s.status === "active" || s.status === "pending" || s.status === "suspended"
      ? s.status
      : undefined,
    isFeatured: s.is_featured,
    isOfficial: s.is_official,
    createdAt: s.created_at,
  };
}

