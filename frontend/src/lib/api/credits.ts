import { api } from "@/lib/api-client";

export interface WalletLevelInfo {
  level: number;
  next_level: number;
  current_threshold: number;
  next_threshold: number;
  xp_into_level: number;
  xp_needed_for_next: number;
}

export interface WalletInfo {
  user_id: number;
  credits: number;
  xp: number;
  level_info: WalletLevelInfo;
}

export interface CreditTransaction {
  id: number;
  user_id: number;
  kind: string;
  xp_delta: number;
  credits_delta: number;
  balance_after: number;
  xp_after: number;
  ref_type?: string;
  ref_id?: number;
  note?: string;
  created_at: string;
}

export function getMyWallet() {
  return api<WalletInfo>("/api/users/me/wallet");
}

export function getMyCreditHistory(limit = 100) {
  return api<CreditTransaction[]>(`/api/users/me/credit-history?limit=${limit}`);
}

export const TRANSACTION_LABELS: Record<string, string> = {
  signup_bonus: "注册礼包",
  topic_reward: "发布主题",
  post_reward: "发布回帖",
  like_received: "收到点赞",
  violation_penalty: "违规处罚",
  translation: "翻译消费",
  admin_adjust: "管理员调整",
};

// ---------- Admin ----------

export interface AdminTransactionsParams {
  user_id?: number;
  kind?: string;
  limit?: number;
  offset?: number;
}

export interface AdminTransactionsResp {
  items: CreditTransaction[];
  total: number;
}

export interface KindStat {
  kind: string;
  count: number;
  xp_delta: number;
  credits_delta: number;
}

export function adminListCreditTransactions(params: AdminTransactionsParams = {}) {
  const q = new URLSearchParams();
  if (params.user_id) q.set("user_id", String(params.user_id));
  if (params.kind) q.set("kind", params.kind);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  const qs = q.toString();
  return api<AdminTransactionsResp>(`/api/admin/credits/transactions${qs ? `?${qs}` : ""}`);
}

export function adminGetCreditStats() {
  return api<{ items: KindStat[] }>("/api/admin/credits/stats");
}

export function adminGetUserWallet(userId: number) {
  return api<WalletInfo>(`/api/admin/credits/users/${userId}/wallet`);
}

export interface AdminAdjustInput {
  user_id: number;
  xp_delta: number;
  credits_delta: number;
  note: string;
}

export function adminAdjustCredits(input: AdminAdjustInput) {
  return api<{ user_id: number; credits: number; xp: number }>("/api/admin/credits/adjust", {
    method: "POST",
    body: input,
  });
}
