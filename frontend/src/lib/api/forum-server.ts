import { apiServer, ServerAPIError } from "./server";
import { adaptCategory, adaptPost, adaptTopic } from "./forum-adapter";
import type {
  ServerCategory,
  ServerPost,
  ServerTopic,
} from "./forum";

export async function fetchCategories() {
  const items = await apiServer<ServerCategory[]>("/api/categories");
  return items.map(adaptCategory);
}

export async function fetchTopics(params: {
  category?: string;
  type?: "anon" | "normal" | "bot";
  sort?: "hot" | "latest" | "top";
  limit?: number;
} = {}) {
  const q = new URLSearchParams();
  if (params.category) q.set("category", params.category);
  else if (params.type) q.set("type", params.type);
  if (params.sort) q.set("sort", params.sort);
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  const items = await apiServer<ServerTopic[]>(
    `/api/topics${qs ? `?${qs}` : ""}`,
  );
  return items.map(adaptTopic);
}

export async function fetchCategory(slug: string) {
  try {
    const c = await apiServer<ServerCategory>(`/api/categories/${slug}`);
    return adaptCategory(c);
  } catch (err) {
    if (err instanceof ServerAPIError && err.status === 404) return null;
    throw err;
  }
}

export async function fetchTopicDetail(id: number) {
  try {
    const data = await apiServer<{ topic: ServerTopic; posts: ServerPost[] }>(
      `/api/topics/${id}`,
    );
    return {
      topic: adaptTopic(data.topic),
      posts: (data.posts ?? []).map(adaptPost),
    };
  } catch (err) {
    if (err instanceof ServerAPIError && err.status === 404) return null;
    throw err;
  }
}
