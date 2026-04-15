import { mockBots, mockCategories, mockTopics, mockUsers } from "@/lib/mock";
import { stripMarkdown } from "@/lib/strip-markdown";
import type { Bot, Category, Topic, User } from "@/types";

export type SearchKind = "topic" | "user" | "bot" | "category";

export interface SearchResult {
  kind: SearchKind;
  id: string | number;
  title: string;
  subtitle?: string;
  href: string;
  score: number;
}

export interface SearchResults {
  topics: SearchResult[];
  users: SearchResult[];
  bots: SearchResult[];
  categories: SearchResult[];
  total: number;
}

function scoreMatch(haystack: string, needle: string): number {
  if (!haystack) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (!n) return 0;
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  if (h.includes(n)) return 60;
  // Simple character-in-order match (sub-sequence)
  let hi = 0;
  for (let i = 0; i < n.length; i++) {
    const idx = h.indexOf(n[i], hi);
    if (idx === -1) return 0;
    hi = idx + 1;
  }
  return 30;
}

function topicToResult(t: Topic, score: number): SearchResult {
  return {
    kind: "topic",
    id: t.id,
    title: t.title,
    subtitle: stripMarkdown(t.excerpt).slice(0, 80),
    href: `/topic/${t.id}`,
    score,
  };
}

function userToResult(u: User, score: number): SearchResult {
  return {
    kind: "user",
    id: u.id,
    title: `@${u.username}`,
    subtitle: u.bio?.slice(0, 80),
    href: `/u/${u.username}`,
    score,
  };
}

function botToResult(b: Bot, score: number): SearchResult {
  return {
    kind: "bot",
    id: b.id,
    title: b.name,
    subtitle: `${b.modelInfo} · ${b.description.slice(0, 60)}`,
    href: `/bot/${b.slug}`,
    score,
  };
}

function categoryToResult(c: Category, score: number): SearchResult {
  return {
    kind: "category",
    id: c.id,
    title: c.name,
    subtitle: `${c.description} · ${c.topicCount} 帖子`,
    href: `/${c.slug}`,
    score,
  };
}

export function searchAll(query: string, limitPerGroup = 5): SearchResults {
  const q = query.trim();
  if (!q) {
    return { topics: [], users: [], bots: [], categories: [], total: 0 };
  }

  const topics = mockTopics
    .map((t) => {
      const s = Math.max(
        scoreMatch(t.title, q),
        scoreMatch(t.excerpt, q) * 0.6,
        (t.tags ?? []).reduce((m, tag) => Math.max(m, scoreMatch(tag, q)), 0) * 0.8,
      );
      return s > 0 ? topicToResult(t, s) : null;
    })
    .filter((x): x is SearchResult => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limitPerGroup);

  const users = mockUsers
    .map((u) => {
      const s = Math.max(
        scoreMatch(u.username, q),
        scoreMatch(u.bio ?? "", q) * 0.5,
      );
      return s > 0 ? userToResult(u, s) : null;
    })
    .filter((x): x is SearchResult => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limitPerGroup);

  const bots = mockBots
    .map((b) => {
      const s = Math.max(
        scoreMatch(b.name, q),
        scoreMatch(b.slug, q) * 0.9,
        scoreMatch(b.description, q) * 0.5,
        (b.tags ?? []).reduce((m, tag) => Math.max(m, scoreMatch(tag, q)), 0) * 0.7,
      );
      return s > 0 ? botToResult(b, s) : null;
    })
    .filter((x): x is SearchResult => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limitPerGroup);

  const categories = mockCategories
    .map((c) => {
      const s = Math.max(
        scoreMatch(c.name, q),
        scoreMatch(c.slug, q),
        scoreMatch(c.description, q) * 0.5,
      );
      return s > 0 ? categoryToResult(c, s) : null;
    })
    .filter((x): x is SearchResult => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limitPerGroup);

  return {
    topics,
    users,
    bots,
    categories,
    total: topics.length + users.length + bots.length + categories.length,
  };
}
