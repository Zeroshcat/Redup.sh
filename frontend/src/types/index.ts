export type AuthorType = "user" | "anon" | "bot";

export interface User {
  id: number;
  username: string;
  avatarUrl?: string;
  level: number;
  bio?: string;
  joinedAt?: string;
  creditScore?: number;
  location?: string;
  website?: string;
  badges?: string[];
  isBanned?: boolean;
  stats?: {
    topics: number;
    replies: number;
    likes: number;
  };
}

export interface Bot {
  id: number;
  slug: string;
  name: string;
  avatarUrl?: string;
  description: string;
  modelInfo: string;
  ownerUsername: string;
  callCount: number;
  likeCount: number;
  tags?: string[];
  status?: "active" | "pending" | "suspended";
  isFeatured?: boolean;
  isOfficial?: boolean;
  createdAt?: string;
}

export interface AnonIdentity {
  anonId: string;
}

export type Author =
  | { type: "user"; user: User }
  | { type: "anon"; anon: AnonIdentity }
  | { type: "bot"; bot: Bot };

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  type: "normal" | "anon" | "bot";
  topicCount: number;
  rules?: string;
}

export interface Topic {
  id: number;
  categoryId: number;
  categorySlug: string;
  categoryName?: string;
  title: string;
  excerpt: string;
  body?: string;
  author: Author;
  replyCount: number;
  likeCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt?: string;
  editedAt?: string;
  minReadLevel?: number;
  lastPostAt: string;
  pinLevel?: number;
  pinWeight?: number;
  isFeatured?: boolean;
  isLocked?: boolean;
  tags?: string[];
  userLiked?: boolean;
  userBookmarked?: boolean;
}

export interface Post {
  id: number;
  topicId: number;
  floor: number;
  content: string;
  author: Author;
  likeCount: number;
  createdAt: string;
  editedAt?: string;
  parentId?: number;
  replyTo?: { floor: number; authorName: string };
  userLiked?: boolean;
}

export interface BotApplication {
  id: number;
  botName: string;
  ownerUsername: string;
  purpose: string;
  persona: string;
  modelInfo: string;
  webhookUrl: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewNote?: string;
}

export interface Report {
  id: number;
  reporterUsername: string;
  targetType: "topic" | "post" | "user" | "bot";
  targetId: number;
  targetTitle: string;
  reason: string;
  description?: string;
  status: "pending" | "resolved" | "dismissed";
  createdAt: string;
  handledBy?: string;
}

export interface ModerationLog {
  id: number;
  operator: string;
  action: string;
  targetType: string;
  targetId: number;
  targetLabel: string;
  reason?: string;
  createdAt: string;
}

export interface BanRecord {
  id: number;
  username: string;
  reason: string;
  bannedBy: string;
  expiresAt?: string;
  createdAt: string;
}

export interface BotInvocationLog {
  id: number;
  botName: string;
  botSlug: string;
  triggerUser: string;
  topicId: number;
  topicTitle: string;
  postFloor: number;
  status: "success" | "timeout" | "error" | "blocked";
  latencyMs: number;
  createdAt: string;
  requestSummary: string;
  responseSummary?: string;
  errorMessage?: string;
}

export interface AnonAuditRecord {
  anonId: string;
  realUsername: string;
  topicId: number;
  topicTitle: string;
  postCount: number;
  firstSeen: string;
  lastSeen: string;
}

export type NotificationType =
  | "reply"
  | "mention"
  | "bot_reply"
  | "like"
  | "follow"
  | "system";

export interface Message {
  id: number;
  conversationId: number;
  fromSelf: boolean;
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: number;
  participant:
    | { type: "user"; username: string; level: number }
    | { type: "bot"; slug: string; name: string; modelInfo: string }
    | { type: "system"; name: string };
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  messages: Message[];
}

export interface Notification {
  id: number;
  type: NotificationType;
  read: boolean;
  actor: Author | null; // null for system
  text: string;
  preview?: string;
  href: string;
  createdAt: string;
}
