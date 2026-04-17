import { api } from "@/lib/api-client";

export interface ServerCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  type: "normal" | "anon" | "bot";
  sort_order: number;
  topic_count: number;
  post_cooldown: number;
  allow_bot: boolean;
  rules?: string;
  created_at: string;
}

export interface ServerUserRef {
  id: number;
  username: string;
  level: number;
  role: string;
  status?: string;
}

export interface ServerTopic {
  id: number;
  category_id: number;
  category_slug?: string;
  category_name?: string;
  user_id: number;
  user?: ServerUserRef;
  title: string;
  body?: string;
  excerpt?: string;
  is_anon: boolean;
  anon_id?: string;
  pin_level: number;
  pin_weight: number;
  is_locked: boolean;
  is_featured: boolean;
  view_count: number;
  reply_count: number;
  like_count: number;
  last_post_at: string;
  created_at: string;
  updated_at?: string;
  edited_at?: string;
  min_read_level?: number;
  user_liked?: boolean;
  user_bookmarked?: boolean;
}

export interface ServerBotRef {
  id: number;
  slug: string;
  name: string;
  avatar_url?: string;
  model_provider: string;
  model_name: string;
}

export interface ServerPost {
  id: number;
  topic_id: number;
  user_id: number;
  user?: ServerUserRef;
  floor: number;
  content: string;
  is_anon: boolean;
  anon_id?: string;
  parent_id?: number;
  reply_to_floor?: number;
  like_count: number;
  is_bot_generated: boolean;
  bot_id?: number;
  bot?: ServerBotRef;
  created_at: string;
  edited_at?: string;
  user_liked?: boolean;
}

export interface ServerTopicDetail {
  topic: ServerTopic;
  posts: ServerPost[];
}

export function listCategories() {
  return api<ServerCategory[]>("/api/categories", { auth: false });
}

export function getCategory(slug: string) {
  return api<ServerCategory>(`/api/categories/${slug}`, { auth: false });
}

export interface ListTopicsParams {
  category?: string;
  sort?: "hot" | "latest" | "top";
  limit?: number;
  offset?: number;
  type?: "normal" | "anon" | "bot";
}

export function listTopics(params: ListTopicsParams = {}) {
  const q = new URLSearchParams();
  if (params.category) q.set("category", params.category);
  if (params.sort) q.set("sort", params.sort);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  if (params.type) q.set("type", params.type);
  const qs = q.toString();
  return api<ServerTopic[]>(`/api/topics${qs ? `?${qs}` : ""}`, { auth: false });
}

export function getTopic(id: number) {
  return api<ServerTopicDetail>(`/api/topics/${id}`, { auth: false });
}

// getTopicAuthed is the authed variant used exclusively for client-side
// rehydration of user_liked / user_bookmarked after SSR. The backend
// endpoint is OptionalAuth, so this works for guests too; the difference
// vs getTopic() is just that we forward the caller's token when present.
export function getTopicAuthed(id: number) {
  return api<ServerTopicDetail>(`/api/topics/${id}`);
}

export function getFeed(limit = 50) {
  return api<ServerTopic[]>(`/api/feed?limit=${limit}`);
}

export interface CreateTopicInput {
  category: string;
  title: string;
  body: string;
  is_anon?: boolean;
  min_read_level?: number;
}

export function createTopic(input: CreateTopicInput) {
  return api<ServerTopic>("/api/topics", {
    method: "POST",
    body: input,
  });
}

export interface CreatePostInput {
  content: string;
  reply_to_floor?: number;
}

export function createPost(topicId: number, input: CreatePostInput) {
  return api<ServerPost>(`/api/topics/${topicId}/posts`, {
    method: "POST",
    body: input,
  });
}

export function updateTopicBody(topicId: number, body: string) {
  return api<ServerTopic>(`/api/topics/${topicId}/body`, {
    method: "PATCH",
    body: { body },
  });
}

export function updatePostContent(postId: number, content: string) {
  return api<ServerPost>(`/api/posts/${postId}`, {
    method: "PATCH",
    body: { content },
  });
}

export function toggleTopicLike(topicId: number) {
  return api<{ liked: boolean; count: number }>(
    `/api/topics/${topicId}/like`,
    { method: "POST" },
  );
}

export function togglePostLike(postId: number) {
  return api<{ liked: boolean; count: number }>(
    `/api/posts/${postId}/like`,
    { method: "POST" },
  );
}

export function toggleBookmark(topicId: number) {
  return api<{ bookmarked: boolean }>(`/api/topics/${topicId}/bookmark`, {
    method: "POST",
  });
}

// ---------- Admin: category CRUD ----------

export interface CategoryInput {
  name: string;
  slug: string;
  description: string;
  type: "normal" | "anon" | "bot";
  post_cooldown: number;
  allow_bot: boolean;
  rules?: string;
}

export function adminCreateCategory(input: CategoryInput) {
  return api<ServerCategory>("/api/admin/categories", { method: "POST", body: input });
}

export function adminUpdateCategory(id: number, input: CategoryInput) {
  return api<ServerCategory>(`/api/admin/categories/${id}`, { method: "PUT", body: input });
}

export function adminDeleteCategory(id: number) {
  return api<{ ok: true }>(`/api/admin/categories/${id}`, { method: "DELETE" });
}

export function adminMoveCategory(id: number, direction: "up" | "down") {
  return api<{ ok: true }>(`/api/admin/categories/${id}/move`, {
    method: "POST",
    body: { direction },
  });
}

export function adminLockTopic(id: number, locked = true) {
  return api<{ ok: true }>(`/api/admin/topics/${id}/lock`, {
    method: "POST",
    body: { locked },
  });
}

export function adminPinTopic(id: number, level: number, weight = 0) {
  return api<{ ok: true }>(`/api/admin/topics/${id}/pin`, {
    method: "POST",
    body: { level, weight },
  });
}

export function adminFeatureTopic(id: number, featured = true) {
  return api<{ ok: true }>(`/api/admin/topics/${id}/feature`, {
    method: "POST",
    body: { featured },
  });
}

export function adminDeleteTopic(id: number) {
  return api<{ ok: true }>(`/api/admin/topics/${id}`, { method: "DELETE" });
}

export function adminDeletePost(id: number) {
  return api<{ ok: true }>(`/api/admin/posts/${id}`, { method: "DELETE" });
}
