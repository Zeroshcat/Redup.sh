import { apiServer } from "./server";

export interface SearchHit {
  id: number;
  title: string;
  category_slug?: string;
  reply_count: number;
}

export interface SearchResp {
  query: string;
  results: SearchHit[];
}

export async function searchTopics(q: string, limit = 30): Promise<SearchResp> {
  if (!q.trim()) return { query: "", results: [] };
  try {
    return await apiServer<SearchResp>(
      `/api/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    );
  } catch {
    return { query: q, results: [] };
  }
}
