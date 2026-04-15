"use client";

import Link from "next/link";
import { useState } from "react";

type Section =
  | "profile"
  | "account"
  | "notifications"
  | "privacy"
  | "appearance"
  | "bots"
  | "connections";

const SECTIONS: { key: Section; label: string; icon: string; group: string }[] = [
  { key: "profile", label: "个人资料", icon: "👤", group: "账户" },
  { key: "account", label: "账号安全", icon: "🔒", group: "账户" },
  { key: "connections", label: "连接应用", icon: "🔗", group: "账户" },
  { key: "notifications", label: "通知偏好", icon: "🔔", group: "偏好" },
  { key: "privacy", label: "隐私", icon: "🕵", group: "偏好" },
  { key: "appearance", label: "外观", icon: "🎨", group: "偏好" },
  { key: "bots", label: "Bot 授权", icon: "⚡", group: "进阶" },
];

export default function SettingsPage() {
  const [active, setActive] = useState<Section>("profile");

  const grouped = SECTIONS.reduce<Record<string, typeof SECTIONS>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">首页</Link>
        <span className="mx-1.5">›</span>
        <span className="text-foreground">设置</span>
      </nav>

      <h1 className="mb-6 text-2xl font-bold text-foreground">设置</h1>

      <div className="flex gap-8">
        <aside className="w-48 shrink-0">
          <nav className="sticky top-20 space-y-5">
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </div>
                <ul className="space-y-0.5">
                  {items.map((s) => (
                    <li key={s.key}>
                      <button
                        type="button"
                        onClick={() => setActive(s.key)}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                          active === s.key
                            ? "bg-primary/10 font-medium text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        <span className="w-4 text-center">{s.icon}</span>
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          {active === "profile" && <ProfileSection />}
          {active === "account" && <AccountSection />}
          {active === "notifications" && <NotificationsSection />}
          {active === "privacy" && <PrivacySection />}
          {active === "appearance" && <AppearanceSection />}
          {active === "bots" && <BotsSection />}
          {active === "connections" && <ConnectionsSection />}
        </section>
      </div>
    </main>
  );
}

/* ---------- Shared pieces ---------- */

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

function SaveBar() {
  return (
    <div className="flex justify-end gap-2 border-t border-border pt-5">
      <button className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent">
        取消
      </button>
      <button className="rounded-md bg-primary px-5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
        保存
      </button>
    </div>
  );
}

/* ---------- Sections ---------- */

function ProfileSection() {
  const [username, setUsername] = useState("zero");
  const [bio, setBio] = useState("Redup 的创始人 · 喜欢搭积木一样搭系统 · 写 Go 也写 TS");
  const [location, setLocation] = useState("杭州");
  const [website, setWebsite] = useState("https://redup.dev");

  return (
    <div>
      <SectionHeader title="个人资料" desc="这些信息将展示在你的主页" />

      <div className="mb-5 flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted-foreground/20 text-2xl font-bold text-foreground">
          Z
        </div>
        <div>
          <button className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
            上传新头像
          </button>
          <p className="mt-1 text-[11px] text-muted-foreground">PNG / JPG, 建议 256×256</p>
        </div>
      </div>

      <Field label="用户名">
        <Input value={username} onChange={(e) => setUsername(e.target.value)} />
      </Field>

      <Field
        label="个人简介"
        hint={`${bio.length} / 200 字符`}
      >
        <Textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={200}
        />
      </Field>

      <Field label="所在地">
        <Input value={location} onChange={(e) => setLocation(e.target.value)} />
      </Field>

      <Field label="个人网站">
        <Input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://"
        />
      </Field>

      <SaveBar />
    </div>
  );
}

function AccountSection() {
  return (
    <div>
      <SectionHeader title="账号安全" desc="邮箱、密码和账号管理" />

      <Field label="邮箱">
        <Input type="email" defaultValue="zero@redup.dev" />
      </Field>

      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">修改密码</h3>
        <div className="space-y-3">
          <Input type="password" placeholder="当前密码" />
          <Input type="password" placeholder="新密码（至少 8 位）" />
          <Input type="password" placeholder="确认新密码" />
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold text-foreground">两步验证</h3>
        <p className="mb-3 text-xs text-muted-foreground">增加一层保护，登录时需要验证码</p>
        <button className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">
          启用 2FA
        </button>
      </div>

      <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
        <h3 className="mb-1 text-sm font-semibold text-rose-600 dark:text-rose-400">危险区域</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          删除账号将移除你的所有帖子、回复和 Bot。此操作不可撤销。
        </p>
        <button className="rounded-md border border-rose-500/40 bg-card px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400">
          删除我的账号
        </button>
      </div>

      <div className="mt-6">
        <SaveBar />
      </div>
    </div>
  );
}

function NotificationsSection() {
  const [prefs, setPrefs] = useState({
    reply_inapp: true,
    reply_email: false,
    mention_inapp: true,
    mention_email: true,
    bot_reply_inapp: true,
    bot_reply_email: false,
    like_inapp: true,
    like_email: false,
    follow_inapp: true,
    follow_email: false,
    system_inapp: true,
    system_email: true,
    digest_weekly: true,
  });

  function toggle(key: keyof typeof prefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  return (
    <div>
      <SectionHeader title="通知偏好" desc="选择你希望接收哪些通知" />

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        站内通知
      </h3>
      <div className="mb-6 rounded-lg border border-border bg-card px-4">
        <Toggle
          checked={prefs.reply_inapp}
          onChange={() => toggle("reply_inapp")}
          label="回复通知"
          desc="有人回复你的帖子"
        />
        <Toggle
          checked={prefs.mention_inapp}
          onChange={() => toggle("mention_inapp")}
          label="@ 提及"
          desc="有人在帖子里 @ 了你"
        />
        <Toggle
          checked={prefs.bot_reply_inapp}
          onChange={() => toggle("bot_reply_inapp")}
          label="Bot 回复"
          desc="你召唤的 Bot 返回了回复"
        />
        <Toggle
          checked={prefs.like_inapp}
          onChange={() => toggle("like_inapp")}
          label="点赞通知"
          desc="有人点赞了你的内容"
        />
        <Toggle
          checked={prefs.follow_inapp}
          onChange={() => toggle("follow_inapp")}
          label="关注通知"
          desc="有新用户关注你"
        />
        <Toggle
          checked={prefs.system_inapp}
          onChange={() => toggle("system_inapp")}
          label="系统通知"
          desc="版规更新、账号异常等站务消息"
        />
      </div>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        邮件通知
      </h3>
      <div className="mb-6 rounded-lg border border-border bg-card px-4">
        <Toggle
          checked={prefs.reply_email}
          onChange={() => toggle("reply_email")}
          label="回复 · 邮件"
        />
        <Toggle
          checked={prefs.mention_email}
          onChange={() => toggle("mention_email")}
          label="@ 提及 · 邮件"
        />
        <Toggle
          checked={prefs.bot_reply_email}
          onChange={() => toggle("bot_reply_email")}
          label="Bot 回复 · 邮件"
        />
        <Toggle
          checked={prefs.system_email}
          onChange={() => toggle("system_email")}
          label="系统通知 · 邮件"
        />
        <Toggle
          checked={prefs.digest_weekly}
          onChange={() => toggle("digest_weekly")}
          label="每周摘要"
          desc="每周一发送一次社区精华汇总"
        />
      </div>

      <SaveBar />
    </div>
  );
}

function PrivacySection() {
  const [prefs, setPrefs] = useState({
    profile_public: true,
    show_joined: true,
    show_location: true,
    allow_dm: true,
    allow_dm_from_bots: false,
    search_indexed: true,
  });

  function toggle(key: keyof typeof prefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  return (
    <div>
      <SectionHeader
        title="隐私"
        desc="控制你的个人信息可见性和被接触方式"
      />

      <div className="mb-6 rounded-lg border border-border bg-card px-4">
        <Toggle
          checked={prefs.profile_public}
          onChange={() => toggle("profile_public")}
          label="公开个人主页"
          desc="未登录用户也能查看你的主页"
        />
        <Toggle
          checked={prefs.show_joined}
          onChange={() => toggle("show_joined")}
          label="显示加入时间"
        />
        <Toggle
          checked={prefs.show_location}
          onChange={() => toggle("show_location")}
          label="显示所在地"
        />
        <Toggle
          checked={prefs.search_indexed}
          onChange={() => toggle("search_indexed")}
          label="在搜索中可见"
          desc="允许其他用户通过搜索找到你"
        />
        <Toggle
          checked={prefs.allow_dm}
          onChange={() => toggle("allow_dm")}
          label="允许私信"
          desc="关闭后仅关注你的人可以发私信"
        />
        <Toggle
          checked={prefs.allow_dm_from_bots}
          onChange={() => toggle("allow_dm_from_bots")}
          label="允许 Bot 发起对话"
        />
      </div>

      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold text-foreground">黑名单</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          被你拉黑的用户无法回复你、@ 你、对你的内容进行互动
        </p>
        <p className="text-xs text-muted-foreground">暂无黑名单</p>
      </div>

      <SaveBar />
    </div>
  );
}

function AppearanceSection() {
  return (
    <div>
      <SectionHeader
        title="外观"
        desc="主题模式和主色可以在左下角浮动按钮实时预览和切换"
      />

      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-foreground">
          点击页面左下角的 <span className="inline-block rounded-full border border-border bg-card px-2 py-0.5 font-mono text-xs">☀/☾</span> 按钮可以：
        </p>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span>·</span>
            <span>切换<span className="text-foreground">浅色 / 深色 / 跟随系统</span></span>
          </li>
          <li className="flex gap-2">
            <span>·</span>
            <span>从 6 种<span className="text-foreground">预设主色</span>里选一个</span>
          </li>
          <li className="flex gap-2">
            <span>·</span>
            <span>用<span className="text-foreground">色相滑块</span>自定义任意主色，实时预览</span>
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          你的外观偏好会自动保存到本地浏览器。
        </p>
      </div>
    </div>
  );
}

function BotsSection() {
  const [prefs, setPrefs] = useState({
    allow_mentions: true,
    allow_in_my_topics: true,
    allow_dm: false,
  });

  function toggle(key: keyof typeof prefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  return (
    <div>
      <SectionHeader
        title="Bot 授权"
        desc="控制 Bot 对你的访问与交互权限"
      />

      <div className="mb-6 rounded-lg border border-border bg-card px-4">
        <Toggle
          checked={prefs.allow_mentions}
          onChange={() => toggle("allow_mentions")}
          label="允许 Bot @ 我"
          desc="Bot 可以在回复中 @ 你提醒你"
        />
        <Toggle
          checked={prefs.allow_in_my_topics}
          onChange={() => toggle("allow_in_my_topics")}
          label="允许 Bot 在我的帖子里自动回复"
          desc="关闭后，只有你主动召唤 Bot 才会回复"
        />
        <Toggle
          checked={prefs.allow_dm}
          onChange={() => toggle("allow_dm")}
          label="允许 Bot 发私信"
        />
      </div>

      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-1 text-sm font-semibold text-foreground">屏蔽的 Bot</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          被屏蔽的 Bot 无法在你的任何内容中回复
        </p>
        <p className="text-xs text-muted-foreground">暂无屏蔽</p>
      </div>

      <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
        <h3 className="mb-1 text-sm font-semibold text-violet-600 dark:text-violet-400">
          我创建的 Bot
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          管理你已发布的 Bot，查看调用数据、更新 Webhook、暂停使用等
        </p>
        <Link
          href="/u/zero?tab=bots"
          className="inline-block rounded-md border border-violet-500/40 bg-card px-3 py-1.5 text-xs font-semibold text-violet-600 hover:bg-violet-500/10 dark:text-violet-400"
        >
          前往 Bot 管理 →
        </Link>
      </div>

      <div className="mt-6">
        <SaveBar />
      </div>
    </div>
  );
}

function ConnectionsSection() {
  const providers = [
    { key: "github", label: "GitHub", icon: "⬢", connected: true, account: "zero-dev" },
    { key: "google", label: "Google", icon: "G", connected: false, account: null },
    { key: "wechat", label: "微信", icon: "💬", connected: false, account: null },
  ];

  return (
    <div>
      <SectionHeader
        title="连接应用"
        desc="已连接的第三方账号，用于登录或 OAuth 授权"
      />

      <div className="space-y-3">
        {providers.map((p) => (
          <div
            key={p.key}
            className="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-lg font-semibold text-foreground">
              {p.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">{p.label}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {p.connected ? `已连接 · @${p.account}` : "未连接"}
              </div>
            </div>
            {p.connected ? (
              <button className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
                断开
              </button>
            ) : (
              <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
                连接
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
