"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { APIError } from "@/lib/api-client";
import { changePassword, updateMe } from "@/lib/api/auth";
import { useAuthStore } from "@/store/auth";

type Section = "profile" | "account" | "preferences" | "appearance";

const SECTIONS: { key: Section; label: string; icon: string; group: string }[] = [
  { key: "profile", label: "个人资料", icon: "👤", group: "账户" },
  { key: "account", label: "账号安全", icon: "🔒", group: "账户" },
  { key: "preferences", label: "通知与隐私", icon: "🛎", group: "偏好" },
  { key: "appearance", label: "外观", icon: "🎨", group: "偏好" },
];

export default function SettingsPage() {
  const [active, setActive] = useState<Section>("profile");
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  const grouped = SECTIONS.reduce<Record<string, typeof SECTIONS>>((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {});

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          首页
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-foreground">设置</span>
      </nav>

      <h1 className="mb-6 text-2xl font-bold text-foreground">设置</h1>

      {hydrated && !user && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">
          请先{" "}
          <Link href="/login" className="underline">
            登录
          </Link>{" "}
          才能修改设置。
        </div>
      )}

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
          {!hydrated ? (
            <div className="text-sm text-muted-foreground">加载中…</div>
          ) : active === "profile" ? (
            <ProfileSection />
          ) : active === "account" ? (
            <AccountSection />
          ) : active === "preferences" ? (
            <PreferencesSection />
          ) : (
            <AppearanceSection />
          )}
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
      className={`w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring disabled:opacity-60 ${
        props.className ?? ""
      }`}
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

function errorMessage(err: unknown): string {
  if (err instanceof APIError) {
    if (err.code === "invalid_credential") return "当前密码不正确";
    if (err.code === "weak_password") return "新密码至少 8 位";
    if (err.code === "invalid_profile") return "资料字段格式有误或超长";
    return `${err.message} (req ${err.requestId})`;
  }
  return "请求失败";
}

/* ---------- Profile ---------- */

function ProfileSection() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [location, setLocation] = useState(user?.location ?? "");
  const [website, setWebsite] = useState(user?.website ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Keep the form in sync with the auth store on hydration / outside
  // updates. Without this the first render still has empty defaults
  // even though the store just finished loading.
  useEffect(() => {
    setAvatarUrl(user?.avatar_url ?? "");
    setBio(user?.bio ?? "");
    setLocation(user?.location ?? "");
    setWebsite(user?.website ?? "");
  }, [user]);

  if (!user) {
    return <p className="text-sm text-muted-foreground">请先登录。</p>;
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateMe({
        avatar_url: avatarUrl,
        bio,
        location,
        website,
      });
      setUser(updated);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const initial = user.username[0]?.toUpperCase() ?? "?";

  return (
    <div>
      <SectionHeader title="个人资料" desc="这些信息将展示在你的主页" />

      <div className="mb-5 flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted-foreground/20 text-2xl font-bold text-foreground">
          {initial}
        </div>
        <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
          头像暂不支持直接上传，在下面「头像链接」里填你的图片 URL。
        </div>
      </div>

      <Field label="用户名">
        <Input value={user.username} disabled />
      </Field>

      <Field label="头像链接" hint="可留空，默认显示首字母头像">
        <Input
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://..."
        />
      </Field>

      <Field label="个人简介" hint={`${bio.length} / 500 字符`}>
        <Textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={500}
        />
      </Field>

      <Field label="所在地">
        <Input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={64} />
      </Field>

      <Field label="个人网站">
        <Input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://"
          maxLength={255}
        />
      </Field>

      {error && (
        <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
          已保存
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-5">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Spinner />}
          {busy ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Account ---------- */

function AccountSection() {
  const user = useAuthStore((s) => s.user);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (!user) {
    return <p className="text-sm text-muted-foreground">请先登录。</p>;
  }

  async function submitPassword() {
    setError(null);
    setOk(false);
    if (newPassword.length < 8) {
      setError("新密码至少 8 位");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    try {
      await changePassword(oldPassword, newPassword);
      setOk(true);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionHeader title="账号安全" desc="邮箱与密码" />

      <Field label="邮箱" hint="修改邮箱功能规划中">
        <Input type="email" value={user.email} disabled />
      </Field>

      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">修改密码</h3>
        <div className="space-y-3">
          <Input
            type="password"
            placeholder="当前密码"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
          />
          <Input
            type="password"
            placeholder="新密码（至少 8 位）"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            type="password"
            placeholder="确认新密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        {error && (
          <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}
        {ok && (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
            密码已更新
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={submitPassword}
            disabled={busy || !oldPassword || !newPassword || !confirmPassword}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Spinner />}
            {busy ? "提交中…" : "更新密码"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-card p-4 text-[11px] text-muted-foreground">
        两步验证、邮箱变更、账号自删等安全功能仍在规划中。若遇到账号异常请通过举报通道或管理员联系我们。
      </div>
    </div>
  );
}

/* ---------- Preferences ---------- */

function PreferencesSection() {
  // Notification preferences, privacy toggles, and bot authorization are
  // intentionally not wired yet — there's no backend store for per-user
  // preferences. Showing live-looking toggles that don't persist would
  // be worse than honestly saying "规划中".
  return (
    <div>
      <SectionHeader title="通知与隐私" desc="通知偏好、隐私选项、Bot 授权" />
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <div className="mb-2 text-3xl">🛎</div>
        <p className="mb-1 text-sm font-medium text-foreground">规划中</p>
        <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground">
          个性化通知和隐私开关需要一张独立的用户偏好表，正在评估。现阶段站内通知默认全部开启，
          你可以在通知中心逐条标记已读。想禁用某类通知或屏蔽特定 Bot，请通过举报反馈给管理员。
        </p>
      </div>
    </div>
  );
}

/* ---------- Appearance ---------- */

function AppearanceSection() {
  return (
    <div>
      <SectionHeader
        title="外观"
        desc="主题模式和主色可以在左下角浮动按钮实时预览和切换"
      />

      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-foreground">
          点击页面左下角的{" "}
          <span className="inline-block rounded-full border border-border bg-card px-2 py-0.5 font-mono text-xs">
            ☀/☾
          </span>{" "}
          按钮可以：
        </p>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span>·</span>
            <span>
              切换<span className="text-foreground">浅色 / 深色 / 跟随系统</span>
            </span>
          </li>
          <li className="flex gap-2">
            <span>·</span>
            <span>
              从 6 种<span className="text-foreground">预设主色</span>里选一个
            </span>
          </li>
          <li className="flex gap-2">
            <span>·</span>
            <span>
              用<span className="text-foreground">色相滑块</span>自定义任意主色，实时预览
            </span>
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          你的外观偏好会自动保存到本地浏览器。
        </p>
      </div>
    </div>
  );
}
