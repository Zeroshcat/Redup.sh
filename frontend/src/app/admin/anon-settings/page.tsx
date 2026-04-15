"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { getAdminSiteSnapshot, saveSiteAnon, type SiteAnon } from "@/lib/api/site";
import { APIError } from "@/lib/api-client";

export default function AdminAnonSettingsPage() {
  // --- backend-wired state ---
  const [anon, setAnon] = useState<SiteAnon | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAdminSiteSnapshot()
      .then((snap) => setAnon(snap.anon))
      .catch((err) => {
        if (err instanceof APIError) setLoadError(`${err.message} (req ${err.requestId})`);
        else setLoadError("无法连接到服务器");
      });
  }, []);

  async function onSavePrefix() {
    if (!anon) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const next = await saveSiteAnon(anon);
      setAnon(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      if (err instanceof APIError) setSaveError(`${err.message} (req ${err.requestId})`);
      else setSaveError("保存失败");
    } finally {
      setSaving(false);
    }
  }

  // --- UI-only state (not yet persisted to backend) ---
  const [enabled, setEnabled] = useState(true);
  const [minLevel, setMinLevel] = useState(2);
  const [minCreditScore, setMinCreditScore] = useState(100);
  const [minAccountAgeDays, setMinAccountAgeDays] = useState(3);
  const [requireEmailVerified, setRequireEmailVerified] = useState(true);

  const [postCooldownSec, setPostCooldownSec] = useState(60);
  const [replyCooldownSec, setReplyCooldownSec] = useState(30);
  const [dailyPostLimit, setDailyPostLimit] = useState(10);
  const [dailyReplyLimit, setDailyReplyLimit] = useState(50);

  const [enableShadowBan, setEnableShadowBan] = useState(true);
  const [allowBotInAnon, setAllowBotInAnon] = useState(false);
  const [allowOfficialBotInAnon, setAllowOfficialBotInAnon] = useState(true);

  const [violationActions, setViolationActions] = useState({
    warn: true,
    mute: true,
    ban: true,
    shadowBan: true,
  });

  return (
    <>
      <AdminHeader
        title="匿名策略"
        subtitle="匿名区的进入门槛、冷却时间、风控策略 · 体现 Redup『前台匿名、后台可控』"
      />

      <div className="max-w-4xl px-8 py-6">
        <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-xs text-blue-700 dark:text-blue-300">
          ℹ 匿名区是 Redup 的核心差异化。建议在严格治理基础上保持匿名体验，绝不能因为追溯能力存在就随意反查。
        </div>

        {loadError && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {loadError}
          </div>
        )}

        <Section
          title="匿名 ID 前缀"
          icon="🆔"
          desc="新生成的匿名 ID 会以此为前缀，如 redup-l8s9a1b2c3。修改后立即生效（热更新），不影响历史映射。"
        >
          {!anon && !loadError && (
            <div className="text-xs text-muted-foreground">正在加载…</div>
          )}
          {anon && (
            <>
              <label className="mb-1.5 block text-xs font-medium text-foreground">前缀</label>
              <input
                type="text"
                value={anon.prefix}
                onChange={(e) => setAnon({ ...anon, prefix: e.target.value })}
                placeholder="redup"
                className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                建议使用小写字母、数字或短横线，长度 ≤ 16
              </p>

              {saveError && (
                <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                  {saveError}
                </div>
              )}
              {saved && (
                <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
                  已保存（已热更新到匿名 ID 生成器）
                </div>
              )}

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={onSavePrefix}
                  disabled={saving}
                  className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
                >
                  {saving ? "保存中…" : "保存前缀"}
                </button>
              </div>
            </>
          )}
        </Section>

        <div className="mb-3 mt-8 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          以下区块是 UI 占位，对应后端模块（风控/限流/封禁）尚未实现，保存后不会持久化。
        </div>

        <Section title="总开关" icon="⚙">
          <Toggle
            checked={enabled}
            onChange={setEnabled}
            label="启用匿名区"
            desc="关闭后所有匿名板块隐藏，已有帖子保留但不可发新串"
          />
        </Section>

        <Section title="进入门槛" icon="🗝" desc="阻止新号滥用匿名区灌水">
          <div className="grid gap-4 md:grid-cols-2">
            <NumberField label="最低等级" value={minLevel} onChange={setMinLevel} hint="低于此等级无法查看/发帖" />
            <NumberField label="最低信用分" value={minCreditScore} onChange={setMinCreditScore} />
            <NumberField label="账号注册天数" value={minAccountAgeDays} onChange={setMinAccountAgeDays} hint="注册不满此天数的新号不可进入" />
          </div>
          <div className="mt-3 rounded-lg border border-border bg-card px-4">
            <Toggle checked={requireEmailVerified} onChange={setRequireEmailVerified} label="要求邮箱已验证" />
          </div>
        </Section>

        <Section title="发言限制" icon="⏱">
          <div className="grid gap-4 md:grid-cols-2">
            <NumberField label="发帖冷却（秒）" value={postCooldownSec} onChange={setPostCooldownSec} />
            <NumberField label="回复冷却（秒）" value={replyCooldownSec} onChange={setReplyCooldownSec} />
            <NumberField label="每日发帖上限" value={dailyPostLimit} onChange={setDailyPostLimit} />
            <NumberField label="每日回复上限" value={dailyReplyLimit} onChange={setDailyReplyLimit} />
          </div>
        </Section>

        <Section title="Bot 在匿名区" icon="🤖">
          <div className="rounded-lg border border-border bg-card px-4">
            <Toggle
              checked={allowBotInAnon}
              onChange={setAllowBotInAnon}
              label="允许用户 Bot 进入匿名区"
              desc="默认关闭。开启后 Bot 回复会使用匿名 ID 身份"
            />
            <Toggle
              checked={allowOfficialBotInAnon}
              onChange={setAllowOfficialBotInAnon}
              label="允许官方 Bot 进入匿名区"
              desc="仅限 Redup 官方 Bot（如规则提醒、风控提示）"
            />
          </div>
        </Section>

        <Section title="风控与处罚" icon="🛡">
          <div className="rounded-lg border border-border bg-card px-4">
            <Toggle
              checked={enableShadowBan}
              onChange={setEnableShadowBan}
              label="启用影子封禁"
              desc="被封禁的用户看起来一切正常，但发言其他人不可见"
            />
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-xs font-medium text-foreground">违规自动执行的动作（多选）</label>
            <div className="grid gap-2 md:grid-cols-2">
              {(
                [
                  ["warn", "首次违规：警告"],
                  ["mute", "二次违规：静音 24h"],
                  ["ban", "三次违规：封禁 7 天"],
                  ["shadowBan", "恶意灌水：影子封禁"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={violationActions[key]}
                    onChange={(e) =>
                      setViolationActions((v) => ({ ...v, [key]: e.target.checked }))
                    }
                    className="h-3.5 w-3.5"
                  />
                  <span className="text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}

function Section({
  title,
  icon,
  desc,
  children,
}: {
  title: string;
  icon?: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-start gap-2">
        {icon && <span className="text-sm">{icon}</span>}
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
      />
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
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
