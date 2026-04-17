import type { Category, Post, Topic } from "@/types";
import type {
  ServerCategory,
  ServerPost,
  ServerTopic,
} from "./forum";

/**
 * Translate backend shapes to the existing frontend types so all the forum
 * components can stay unchanged. Anonymous items get a synthetic anon_id
 * derived from the backend-provided value (or a placeholder for now).
 */

export function adaptCategory(c: ServerCategory): Category {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    type: c.type,
    topicCount: c.topic_count,
    rules: c.rules,
  };
}

export function adaptTopic(t: ServerTopic): Topic {
  return {
    id: t.id,
    categoryId: t.category_id,
    categorySlug: t.category_slug ?? "",
    categoryName: t.category_name,
    title: t.title,
    excerpt: t.excerpt ?? "",
    body: t.body,
    author: t.is_anon
      ? {
          type: "anon",
          anon: { anonId: t.anon_id || `Anon-${String(t.id).padStart(4, "0")}` },
        }
      : {
          type: "user",
          user: {
            id: t.user?.id ?? t.user_id,
            username: t.user?.username ?? `user_${t.user_id}`,
            level: t.user?.level ?? 1,
            isBanned: t.user?.status === "banned",
          },
        },
    replyCount: t.reply_count,
    likeCount: t.like_count,
    viewCount: t.view_count,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    editedAt: t.edited_at,
    minReadLevel: t.min_read_level,
    lastPostAt: t.last_post_at,
    pinLevel: t.pin_level,
    pinWeight: t.pin_weight,
    isFeatured: t.is_featured,
    isLocked: t.is_locked,
    tags: [],
    userLiked: t.user_liked ?? false,
    userBookmarked: t.user_bookmarked ?? false,
  };
}

export function adaptPost(p: ServerPost): Post {
  let author: Post["author"];
  if (p.is_bot_generated && p.bot) {
    author = {
      type: "bot",
      bot: {
        id: p.bot.id,
        slug: p.bot.slug,
        name: p.bot.name,
        avatarUrl: p.bot.avatar_url,
        description: "",
        modelInfo: `${p.bot.model_provider} · ${p.bot.model_name}`,
        ownerUsername: "",
        callCount: 0,
        likeCount: 0,
      },
    };
  } else if (p.is_anon) {
    author = {
      type: "anon",
      anon: { anonId: p.anon_id || `Anon-${String(p.id).padStart(4, "0")}` },
    };
  } else {
    author = {
      type: "user",
      user: {
        id: p.user?.id ?? p.user_id,
        username: p.user?.username ?? `user_${p.user_id}`,
        level: p.user?.level ?? 1,
        isBanned: p.user?.status === "banned",
      },
    };
  }
  return {
    id: p.id,
    topicId: p.topic_id,
    floor: p.floor,
    content: p.content,
    author,
    likeCount: p.like_count,
    createdAt: p.created_at,
    editedAt: p.edited_at,
    parentId: p.parent_id,
    replyTo:
      p.reply_to_floor !== undefined && p.reply_to_floor !== null
        ? { floor: p.reply_to_floor, authorName: "" }
        : undefined,
    userLiked: p.user_liked ?? false,
  };
}

interface ServerUser {
  id: number;
  username: string;
  level: number;
}

// server types re-exported for callers that want to import from one place
export type { ServerCategory, ServerPost, ServerTopic, ServerUser };
