"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import {
  getAdminSiteSnapshot,
  saveSiteBasic,
  saveSiteCredits,
  saveSiteFooter,
  saveSiteModeration,
  saveSiteRegistration,
  saveSiteRules,
  saveSiteSEO,
  type SiteBasic,
  type SiteCredits,
  type SiteFooter,
  type SiteModeration,
  type SiteRegistration,
  type SiteRules,
  type SiteSEO,
  type SiteSnapshot,
} from "@/lib/api/site";
import { APIError } from "@/lib/api-client";

type Section = "basic" | "registration" | "seo" | "rules" | "footer" | "credits" | "moderation";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "basic", label: "基本信息", icon: "📄" },
  { key: "registration", label: "注册策略", icon: "🗝" },
  { key: "seo", label: "SEO", icon: "🔍" },
  { key: "rules", label: "社区规则", icon: "📜" },
  { key: "footer", label: "页脚与备案", icon: "🧾" },
  { key: "credits", label: "积分与等级", icon: "✦" },
  { key: "moderation", label: "AI 审核", icon: "🛡" },
];

export default function AdminSitePage() {
  const [active, setActive] = useState<Section>("basic");
  const [snapshot, setSnapshot] = useState<SiteSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getAdminSiteSnapshot()
      .then(setSnapshot)
      .catch((err) => {
        if (err instanceof APIError) {
          setLoadError(`${err.message} (req ${err.requestId})`);
        } else {
          setLoadError("无法连接到服务器");
        }
      });
  }, []);

  return (
    <>
      <AdminHeader title="站点设置" subtitle="网站基本信息、注册策略、SEO、社区规则等" />

      <div className="flex">
        <aside className="w-48 shrink-0 border-r border-border bg-card">
          <nav className="sticky top-0 p-2">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                  active === s.key
                    ? "bg-primary/10 font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <span className="w-4 text-center">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 px-8 py-6">
          {loadError && (
            <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
              {loadError}
            </div>
          )}

          {!snapshot && !loadError && (
            <div className="text-sm text-muted-foreground">正在加载站点配置…</div>
          )}

          {snapshot && (
            <>
              {active === "basic" && (
                <BasicSection
                  value={snapshot.basic}
                  onSaved={(v) => setSnapshot({ ...snapshot, basic: v })}
                />
              )}
              {active === "registration" && (
                <RegistrationSection
                  value={snapshot.registration}
                  onSaved={(v) => setSnapshot({ ...snapshot, registration: v })}
                />
              )}
              {active === "seo" && (
                <SeoSection
                  value={snapshot.seo}
                  onSaved={(v) => setSnapshot({ ...snapshot, seo: v })}
                />
              )}
              {active === "rules" && (
                <RulesSection
                  value={snapshot.rules}
                  onSaved={(v) => setSnapshot({ ...snapshot, rules: v })}
                />
              )}
              {active === "footer" && (
                <FooterSection
                  value={snapshot.footer}
                  onSaved={(v) => setSnapshot({ ...snapshot, footer: v })}
                />
              )}
              {active === "credits" && (
                <CreditsSection
                  value={snapshot.credits}
                  onSaved={(v) => setSnapshot({ ...snapshot, credits: v })}
                />
              )}
              {active === "moderation" && (
                <ModerationSection
                  value={snapshot.moderation}
                  onSaved={(v) => setSnapshot({ ...snapshot, moderation: v })}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------- shared ---------- */

function SectionHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-5 border-b border-border pb-4">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
    />
  );
}

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {desc && <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-1 h-5 w-9 shrink-0 rounded-full border transition ${
          checked ? "border-primary bg-primary" : "border-border bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background transition ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function SaveBar({
  onSave,
  onReset,
  loading,
  error,
  saved,
}: {
  onSave: () => void;
  onReset?: () => void;
  loading?: boolean;
  error?: string | null;
  saved?: boolean;
}) {
  return (
    <div className="mt-6 space-y-3 border-t border-border pt-5">
      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
          已保存
        </div>
      )}
      <div className="flex justify-end gap-2">
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
          >
            重置
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={loading}
          className="rounded-md bg-primary px-5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {loading ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}

function useSaveState<T>(
  initial: T,
  save: (v: T) => Promise<T>,
  onSaved: (v: T) => void,
) {
  const [value, setValue] = useState<T>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  async function onSave() {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const next = await save(value);
      setValue(next);
      onSaved(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      if (err instanceof APIError) {
        setError(`${err.message} (req ${err.requestId})`);
      } else {
        setError("保存失败");
      }
    } finally {
      setLoading(false);
    }
  }

  function onReset() {
    setValue(initial);
    setError(null);
  }

  return { value, setValue, loading, error, saved, onSave, onReset };
}

/* ---------- sections ---------- */

function BasicSection({ value, onSaved }: { value: SiteBasic; onSaved: (v: SiteBasic) => void }) {
  const s = useSaveState(value, saveSiteBasic, onSaved);

  return (
    <div>
      <SectionHeader title="基本信息" desc="展示在首页、SEO、站内各处的基础标识" />

      <Field label="站点名称">
        <Input
          value={s.value.name}
          onChange={(e) => s.setValue({ ...s.value, name: e.target.value })}
        />
      </Field>

      <Field label="标语（Tagline）" hint="显示在首页 Hero、meta description">
        <Input
          value={s.value.tagline}
          onChange={(e) => s.setValue({ ...s.value, tagline: e.target.value })}
          maxLength={80}
        />
      </Field>

      <Field label="站点描述">
        <Textarea
          value={s.value.description}
          onChange={(e) => s.setValue({ ...s.value, description: e.target.value })}
          rows={3}
          maxLength={280}
        />
      </Field>

      <Field label="Logo URL">
        <Input
          value={s.value.logo_url ?? ""}
          onChange={(e) => s.setValue({ ...s.value, logo_url: e.target.value })}
          placeholder="https://..."
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="联系邮箱">
          <Input
            type="email"
            value={s.value.contact_email ?? ""}
            onChange={(e) => s.setValue({ ...s.value, contact_email: e.target.value })}
          />
        </Field>
        <Field label="默认语言">
          <select
            value={s.value.language}
            onChange={(e) => s.setValue({ ...s.value, language: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          >
            <option value="zh-CN">简体中文</option>
            <option value="zh-TW">繁體中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </Field>
      </div>

      <Field label="时区">
        <select
          value={s.value.timezone}
          onChange={(e) => s.setValue({ ...s.value, timezone: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
        >
          <option value="Asia/Shanghai">Asia/Shanghai (UTC+8)</option>
          <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
          <option value="UTC">UTC</option>
          <option value="America/Los_Angeles">America/Los_Angeles (UTC-8)</option>
        </select>
      </Field>

      <SaveBar onSave={s.onSave} onReset={s.onReset} loading={s.loading} error={s.error} saved={s.saved} />
    </div>
  );
}

function RegistrationSection({
  value,
  onSaved,
}: {
  value: SiteRegistration;
  onSaved: (v: SiteRegistration) => void;
}) {
  const s = useSaveState(value, saveSiteRegistration, onSaved);
  const v = s.value;
  const set = (patch: Partial<SiteRegistration>) => s.setValue({ ...v, ...patch });

  return (
    <div>
      <SectionHeader title="注册策略" desc="控制谁能加入社区以及如何加入" />

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        注册模式
      </h3>
      <div className="space-y-2">
        {(
          [
            ["open", "开放注册", "任何人都可以直接注册（推荐初期冷启动）"],
            ["invite", "邀请制", "需要已有用户发放邀请码"],
            ["review", "审核制", "注册后进入待审队列，管理员手动审批"],
            ["closed", "关闭注册", "临时冻结，不接受任何新注册"],
          ] as const
        ).map(([mode, label, desc]) => (
          <label
            key={mode}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
              v.mode === mode ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
            }`}
          >
            <input
              type="radio"
              checked={v.mode === mode}
              onChange={() => set({ mode })}
              className="mt-0.5 h-3.5 w-3.5"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{label}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{desc}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card px-4">
        <Toggle
          checked={v.email_verify_required}
          onChange={(x) => set({ email_verify_required: x })}
          label="邮箱验证"
          desc="用户必须点击确认邮件才能激活账号"
        />
        <Toggle
          checked={v.email_domain_restricted}
          onChange={(x) => set({ email_domain_restricted: x })}
          label="限制邮箱域名"
          desc="仅允许特定域名的邮箱注册"
        />
        <Toggle
          checked={v.invite_required}
          onChange={(x) => set({ invite_required: x })}
          label="需要邀请码"
          desc="即便在开放注册模式下，也强制要求邀请码"
        />
      </div>

      {v.email_domain_restricted && (
        <div className="mt-4">
          <Field label="允许的邮箱域名" hint="每行一个，如 example.com">
            <Textarea
              value={(v.allowed_email_domains ?? []).join("\n")}
              onChange={(e) =>
                set({
                  allowed_email_domains: e.target.value
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
              rows={3}
              className="font-mono"
            />
          </Field>
        </div>
      )}

      <h3 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        用户名规则
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="最短长度">
          <Input
            type="number"
            value={v.username_min_len}
            onChange={(e) => set({ username_min_len: Number(e.target.value) })}
          />
        </Field>
        <Field label="最长长度">
          <Input
            type="number"
            value={v.username_max_len}
            onChange={(e) => set({ username_max_len: Number(e.target.value) })}
          />
        </Field>
      </div>

      <Field label="保留词" hint="每行一个，禁止用户名包含这些词">
        <Textarea
          value={(v.reserved_usernames ?? []).join("\n")}
          onChange={(e) =>
            set({
              reserved_usernames: e.target.value
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean),
            })
          }
          rows={5}
          className="font-mono"
        />
      </Field>

      <h3 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        密码规则
      </h3>
      <Field label="最短长度">
        <Input
          type="number"
          value={v.password_min_len}
          onChange={(e) => set({ password_min_len: Number(e.target.value) })}
        />
      </Field>
      <div className="rounded-lg border border-border bg-card px-4">
        <Toggle
          checked={v.password_require_mixed}
          onChange={(x) => set({ password_require_mixed: x })}
          label="要求大小写混合"
        />
      </div>

      <h3 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        新用户限制
      </h3>
      <div className="rounded-lg border border-border bg-card px-4">
        <Toggle
          checked={v.allow_anon_entry}
          onChange={(x) => set({ allow_anon_entry: x })}
          label="允许新用户进入匿名区"
          desc="关闭后新用户需达到指定等级才能查看/发帖"
        />
      </div>

      {!v.allow_anon_entry && (
        <div className="mt-4">
          <Field label="进入匿名区所需最低等级">
            <Input
              type="number"
              value={v.min_level_for_anon}
              onChange={(e) => set({ min_level_for_anon: Number(e.target.value) })}
            />
          </Field>
        </div>
      )}

      <SaveBar onSave={s.onSave} onReset={s.onReset} loading={s.loading} error={s.error} saved={s.saved} />
    </div>
  );
}

function SeoSection({ value, onSaved }: { value: SiteSEO; onSaved: (v: SiteSEO) => void }) {
  const s = useSaveState(value, saveSiteSEO, onSaved);
  const v = s.value;
  const set = (patch: Partial<SiteSEO>) => s.setValue({ ...v, ...patch });

  return (
    <div>
      <SectionHeader title="SEO" desc="搜索引擎优化与社交分享预览" />

      <div className="rounded-lg border border-border bg-card px-4">
        <Toggle
          checked={v.indexable}
          onChange={(x) => set({ indexable: x })}
          label="允许搜索引擎索引"
          desc="关闭后 robots.txt 将禁止所有爬虫，适合预发布阶段"
        />
        <Toggle
          checked={v.sitemap}
          onChange={(x) => set({ sitemap: x })}
          label="生成 sitemap.xml"
        />
      </div>

      <div className="mt-5">
        <Field label="默认分享图片 (og:image)" hint="推荐 1200×630">
          <Input
            value={v.default_og_image ?? ""}
            onChange={(e) => set({ default_og_image: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Google Analytics ID" hint="留空则不加载统计脚本">
        <Input
          value={v.google_analytics_id ?? ""}
          onChange={(e) => set({ google_analytics_id: e.target.value })}
          placeholder="G-XXXXXXXXXX"
          className="font-mono"
        />
      </Field>

      <SaveBar onSave={s.onSave} onReset={s.onReset} loading={s.loading} error={s.error} saved={s.saved} />
    </div>
  );
}

function RulesSection({ value, onSaved }: { value: SiteRules; onSaved: (v: SiteRules) => void }) {
  const s = useSaveState(value, saveSiteRules, onSaved);

  return (
    <div>
      <SectionHeader title="社区规则" desc="用户注册时和社区内查看的规则文档，支持 Markdown" />

      <Field label="规则正文" hint={`${s.value.content.length} 字符`}>
        <Textarea
          value={s.value.content}
          onChange={(e) => s.setValue({ content: e.target.value })}
          rows={16}
          className="font-mono text-xs"
        />
      </Field>

      <SaveBar onSave={s.onSave} onReset={s.onReset} loading={s.loading} error={s.error} saved={s.saved} />
    </div>
  );
}

function FooterSection({ value, onSaved }: { value: SiteFooter; onSaved: (v: SiteFooter) => void }) {
  const s = useSaveState(value, saveSiteFooter, onSaved);
  const v = s.value;
  const set = (patch: Partial<SiteFooter>) => s.setValue({ ...v, ...patch });

  return (
    <div>
      <SectionHeader title="页脚与备案" desc="页脚显示的版权信息、ICP 备案、自定义链接" />

      <Field label="版权声明">
        <Input value={v.copyright} onChange={(e) => set({ copyright: e.target.value })} />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="ICP 备案号" hint="如 京ICP备XXXXX号">
          <Input
            value={v.icp ?? ""}
            onChange={(e) => set({ icp: e.target.value })}
            className="font-mono"
          />
        </Field>
        <Field label="ICP 备案查询链接">
          <Input
            value={v.icp_link ?? ""}
            onChange={(e) => set({ icp_link: e.target.value })}
            className="font-mono"
          />
        </Field>
      </div>

      <Field label="公安备案号">
        <Input
          value={v.police_icp ?? ""}
          onChange={(e) => set({ police_icp: e.target.value })}
          className="font-mono"
        />
      </Field>

      <Field label="自定义链接" hint="每行一个，格式：标签|URL">
        <Textarea
          value={(v.links ?? []).map((l) => `${l.label}|${l.url}`).join("\n")}
          onChange={(e) =>
            set({
              links: e.target.value
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean)
                .map((line) => {
                  const [label, url] = line.split("|");
                  return { label: label ?? "", url: url ?? "" };
                }),
            })
          }
          rows={5}
          className="font-mono text-xs"
        />
      </Field>

      <SaveBar onSave={s.onSave} onReset={s.onReset} loading={s.loading} error={s.error} saved={s.saved} />
    </div>
  );
}

function CreditsSection({
  value,
  onSaved,
}: {
  value: SiteCredits;
  onSaved: (v: SiteCredits) => void;
}) {
  const s = useSaveState(value, saveSiteCredits, onSaved);
  const v = s.value;
  const set = (patch: Partial<SiteCredits>) => s.setValue({ ...v, ...patch });
  const setReward = (
    key: "signup_bonus" | "topic_reward" | "post_reward",
    field: "xp" | "credits",
    n: number,
  ) => set({ [key]: { ...v[key], [field]: n } } as Partial<SiteCredits>);

  return (
    <div>
      <SectionHeader title="积分与等级" desc="所有奖励规则、等级阈值、翻译消费在此调整，保存后即时生效" />

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        奖励规则
      </h3>
      <div className="space-y-3">
        <RewardRow
          label="注册礼包"
          hint="新用户注册时一次性发放"
          xp={v.signup_bonus.xp}
          credits={v.signup_bonus.credits}
          onChangeXP={(n) => setReward("signup_bonus", "xp", n)}
          onChangeCredits={(n) => setReward("signup_bonus", "credits", n)}
        />
        <RewardRow
          label="发布主题"
          hint="每次创建符合长度门槛的新主题时发放"
          xp={v.topic_reward.xp}
          credits={v.topic_reward.credits}
          onChangeXP={(n) => setReward("topic_reward", "xp", n)}
          onChangeCredits={(n) => setReward("topic_reward", "credits", n)}
        />
        <RewardRow
          label="发布回帖"
          hint="每次发回帖时发放（bot 生成的不算）"
          xp={v.post_reward.xp}
          credits={v.post_reward.credits}
          onChangeXP={(n) => setReward("post_reward", "xp", n)}
          onChangeCredits={(n) => setReward("post_reward", "credits", n)}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="收到点赞 XP" hint="每个 (帖, 点赞者) 仅奖励一次">
            <Input
              type="number"
              value={v.like_xp_reward}
              onChange={(e) => set({ like_xp_reward: Number(e.target.value) })}
            />
          </Field>
          <Field label="违规处罚（扣分）" hint="举报被确认违规时扣除的 credits">
            <Input
              type="number"
              value={v.violation_penalty}
              onChange={(e) => set({ violation_penalty: Number(e.target.value) })}
            />
          </Field>
        </div>
      </div>

      <h3 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        防刷限制
      </h3>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="mb-3 text-[11px] text-amber-700 dark:text-amber-300">
          ⚠ 0 表示不限制；超出上限的奖励会被静默丢弃，不影响发帖本身
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="每日发主题奖励上限">
            <Input
              type="number"
              value={v.daily_topic_cap}
              onChange={(e) => set({ daily_topic_cap: Number(e.target.value) })}
            />
          </Field>
          <Field label="每日发回帖奖励上限">
            <Input
              type="number"
              value={v.daily_post_cap}
              onChange={(e) => set({ daily_post_cap: Number(e.target.value) })}
            />
          </Field>
          <Field label="每日点赞 XP 上限">
            <Input
              type="number"
              value={v.daily_like_xp_cap}
              onChange={(e) => set({ daily_like_xp_cap: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="主题最少字数（低于此长度不发奖励）">
            <Input
              type="number"
              value={v.min_topic_length}
              onChange={(e) => set({ min_topic_length: Number(e.target.value) })}
            />
          </Field>
          <Field label="回帖最少字数">
            <Input
              type="number"
              value={v.min_post_length}
              onChange={(e) => set({ min_post_length: Number(e.target.value) })}
            />
          </Field>
        </div>
      </div>

      <h3 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        等级曲线
      </h3>
      <Field label="等级阈值（XP）" hint="从 L1 到 L10 所需的累计 XP，逗号分隔">
        <Input
          value={v.level_thresholds.join(", ")}
          onChange={(e) =>
            set({
              level_thresholds: e.target.value
                .split(/[,，\s]+/)
                .map((x) => Number(x.trim()))
                .filter((n) => !isNaN(n)),
            })
          }
          className="font-mono"
        />
      </Field>

      <h3 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        翻译消费
      </h3>
      <p className="mb-3 text-[11px] text-muted-foreground">
        翻译走 platform 的 LLM key（在 .env 配置）。同样内容 + 同样目标语言会缓存结果，缓存命中永远免费。
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="每日免费翻译次数">
          <Input
            type="number"
            value={v.daily_free_translations}
            onChange={(e) => set({ daily_free_translations: Number(e.target.value) })}
          />
        </Field>
        <Field label="超额单次扣分（credits）">
          <Input
            type="number"
            value={v.translation_cost}
            onChange={(e) => set({ translation_cost: Number(e.target.value) })}
          />
        </Field>
        <Field label="LLM 提供方" hint="必须在 .env 配置了对应的 API key">
          <select
            value={v.translation_provider}
            onChange={(e) => set({ translation_provider: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </Field>
        <Field label="模型名">
          <Input
            value={v.translation_model}
            onChange={(e) => set({ translation_model: e.target.value })}
            placeholder="gpt-4o-mini / claude-haiku-4-5"
            className="font-mono"
          />
        </Field>
      </div>

      <SaveBar onSave={s.onSave} onReset={s.onReset} loading={s.loading} error={s.error} saved={s.saved} />
    </div>
  );
}

function RewardRow({
  label,
  hint,
  xp,
  credits,
  onChangeXP,
  onChangeCredits,
}: {
  label: string;
  hint?: string;
  xp: number;
  credits: number;
  onChangeXP: (n: number) => void;
  onChangeCredits: (n: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
            XP
          </label>
          <Input type="number" value={xp} onChange={(e) => onChangeXP(Number(e.target.value))} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
            Credits
          </label>
          <Input
            type="number"
            value={credits}
            onChange={(e) => onChangeCredits(Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}

function ModerationSection({
  value,
  onSaved,
}: {
  value: SiteModeration;
  onSaved: (v: SiteModeration) => void;
}) {
  const s = useSaveState(value, saveSiteModeration, onSaved);
  const v = s.value;
  const set = (patch: Partial<SiteModeration>) => s.setValue({ ...v, ...patch });

  return (
    <div>
      <SectionHeader
        title="AI 审核"
        desc="启用后，每次发主题/发回帖前都会调用 platform LLM 对照「社区规则」判断内容。判决会写入 moderation_logs，admin 可在 /admin/moderation 复核。"
      />

      <div className="rounded-lg border border-border bg-card px-4">
        <Toggle
          checked={v.enabled}
          onChange={(x) => set({ enabled: x })}
          label="启用 AI 审核"
          desc="未启用时所有内容直接放行；启用时每次发帖会调一次 LLM"
        />
        <Toggle
          checked={v.block_action}
          onChange={(x) => set({ block_action: x })}
          label="block 判决真正阻断发帖"
          desc="关闭则只记录到日志（dry-run 模式，方便调优 prompt）"
        />
        <Toggle
          checked={v.suggest_rewrite}
          onChange={(x) => set({ suggest_rewrite: x })}
          label="被 block 时给出修改建议"
          desc="再调一次 LLM 生成合规版本，用户可一键采用。会增加 LLM 调用成本"
        />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="LLM 提供方" hint="必须在 .env 配置了对应的 API key">
          <select
            value={v.provider}
            onChange={(e) => set({ provider: e.target.value })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </Field>
        <Field label="模型名">
          <Input
            value={v.model}
            onChange={(e) => set({ model: e.target.value })}
            placeholder="gpt-4o-mini / claude-haiku-4-5"
            className="font-mono"
          />
        </Field>
      </div>

      <div className="mt-5">
        <Field
          label="自动举报阈值"
          hint="用户累积此数量（含）的未处理 warn/block 后，自动生成一条系统举报进入 /admin/reports。0 = 关闭"
        >
          <Input
            type="number"
            value={v.auto_flag_threshold}
            onChange={(e) => set({ auto_flag_threshold: Number(e.target.value) })}
            className="max-w-xs"
          />
        </Field>
      </div>

      <div className="mt-5 rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-[11px] text-blue-700 dark:text-blue-300">
        ℹ 审核规则取自「社区规则」标签页的内容 —— 修改那里的规则文本就会立即影响 AI 的判决依据。
        板块级版规会作为附加依据叠加到全站规则之上。
      </div>

      <SaveBar onSave={s.onSave} onReset={s.onReset} loading={s.loading} error={s.error} saved={s.saved} />
    </div>
  );
}
