import { api } from "@/lib/api-client";
import { apiServer } from "./server";

// Shapes mirror backend internal/platform/site/model.go

export interface SiteBasic {
  name: string;
  tagline: string;
  description: string;
  logo_url?: string;
  contact_email?: string;
  language: string;
  timezone: string;
  post_edit_window_minutes: number;
  outbound_proxy_url?: string;
}

export interface SiteRegistration {
  mode: "open" | "invite" | "review" | "closed";
  email_verify_required: boolean;
  email_domain_restricted: boolean;
  allowed_email_domains?: string[];
  invite_required: boolean;
  username_min_len: number;
  username_max_len: number;
  reserved_usernames?: string[];
  password_min_len: number;
  password_require_mixed: boolean;
  allow_anon_entry: boolean;
  min_level_for_anon: number;
}

export interface SiteSEO {
  indexable: boolean;
  sitemap: boolean;
  default_og_image?: string;
  google_analytics_id?: string;
}

export interface SiteRules {
  content: string;
}

export interface FooterLink {
  label: string;
  url: string;
}

export interface SiteFooter {
  copyright: string;
  icp?: string;
  icp_link?: string;
  police_icp?: string;
  links?: FooterLink[];
}

export interface SiteAnon {
  prefix: string;
}

export interface RewardBundle {
  xp: number;
  credits: number;
}

export interface SiteCredits {
  signup_bonus: RewardBundle;
  topic_reward: RewardBundle;
  post_reward: RewardBundle;
  like_xp_reward: number;
  violation_penalty: number;
  daily_topic_cap: number;
  daily_post_cap: number;
  daily_like_xp_cap: number;
  min_topic_length: number;
  min_post_length: number;
  level_thresholds: number[];
  daily_free_translations: number;
  translation_cost: number;
  translation_provider: string;
  translation_model: string;
}

export interface SiteModeration {
  enabled: boolean;
  provider: string;
  model: string;
  block_action: boolean;
  auto_flag_threshold: number;
  suggest_rewrite: boolean;
}

export type LLMProviderKind = "openai" | "anthropic";

export interface SiteLLMProvider {
  id: string;
  name: string;
  kind: LLMProviderKind;
  base_url: string;
  // On read the server masks real keys with "••••••••". On write, the
  // client sends the empty string (or the mask string) to mean "keep
  // the stored key" — the backend treats both as a signal to preserve
  // the existing credential. Typing a new key replaces it.
  api_key: string;
  enabled: boolean;
  models?: string[];
  note?: string;
}

export interface SiteLLM {
  providers: SiteLLMProvider[];
}

export type SMTPEncryption = "none" | "starttls" | "tls";

// On read the server masks the real password with "••••••••". On write,
// the client sends the empty string (or the mask) to mean "keep the
// stored credential" — mirrors how LLM api keys are handled.
export interface SiteSMTP {
  enabled: boolean;
  host: string;
  port: number;
  username?: string;
  password?: string;
  encryption: SMTPEncryption;
  from_address: string;
  from_name?: string;
}

export interface SiteLinks {
  external_warn_enabled: boolean;
  trusted_domains?: string[];
  preview_enabled: boolean;
  denylist_domains?: string[];
}

export interface SiteSnapshot {
  basic: SiteBasic;
  registration: SiteRegistration;
  seo: SiteSEO;
  rules: SiteRules;
  footer: SiteFooter;
  anon: SiteAnon;
  credits: SiteCredits;
  moderation: SiteModeration;
  llm: SiteLLM;
  smtp: SiteSMTP;
  links: SiteLinks;
}

export interface SitePublicInfo {
  name: string;
  tagline: string;
  description: string;
  logo_url?: string;
  language: string;
  registration_mode: string;
  anon_prefix: string;
  external_warn_enabled?: boolean;
  trusted_domains?: string[];
  preview_enabled?: boolean;
}

// ---------- Server-side (SSR) ----------

export async function fetchPublicSite(): Promise<SitePublicInfo | null> {
  try {
    return await apiServer<SitePublicInfo>("/api/site");
  } catch {
    // Backend unreachable — let callers fall back to defaults.
    return null;
  }
}

// ---------- Client-side (admin) ----------

export function getAdminSiteSnapshot() {
  return api<SiteSnapshot>("/api/admin/site");
}

export function saveSiteBasic(v: SiteBasic) {
  return api<SiteBasic>("/api/admin/site/basic", { method: "PUT", body: v });
}

export function saveSiteRegistration(v: SiteRegistration) {
  return api<SiteRegistration>("/api/admin/site/registration", { method: "PUT", body: v });
}

export function saveSiteSEO(v: SiteSEO) {
  return api<SiteSEO>("/api/admin/site/seo", { method: "PUT", body: v });
}

export function saveSiteRules(v: SiteRules) {
  return api<SiteRules>("/api/admin/site/rules", { method: "PUT", body: v });
}

export function saveSiteFooter(v: SiteFooter) {
  return api<SiteFooter>("/api/admin/site/footer", { method: "PUT", body: v });
}

export function saveSiteAnon(v: SiteAnon) {
  return api<SiteAnon>("/api/admin/site/anon", { method: "PUT", body: v });
}

export function saveSiteCredits(v: SiteCredits) {
  return api<SiteCredits>("/api/admin/site/credits", { method: "PUT", body: v });
}

export function saveSiteModeration(v: SiteModeration) {
  return api<SiteModeration>("/api/admin/site/moderation", { method: "PUT", body: v });
}

export function saveSiteLLM(v: SiteLLM) {
  return api<SiteLLM>("/api/admin/site/llm", { method: "PUT", body: v });
}

export function saveSiteSMTP(v: SiteSMTP) {
  return api<SiteSMTP>("/api/admin/site/smtp", { method: "PUT", body: v });
}

export interface MailTestResult {
  ok: boolean;
  to: string;
}

export function saveSiteLinks(v: SiteLinks) {
  return api<SiteLinks>("/api/admin/site/links", { method: "PUT", body: v });
}

export function sendTestMail(to: string, subject?: string, body?: string) {
  return api<MailTestResult>("/api/admin/mail/test", {
    method: "POST",
    body: { to, subject, body },
  });
}
