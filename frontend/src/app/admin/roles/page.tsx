"use client";

import { useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";

type RoleKey = string;

interface Role {
  key: RoleKey;
  label: string;
  description: string;
  builtin: boolean;
  color: string;
  userCount: number;
  permissions: Record<string, boolean>;
}

interface PermissionGroup {
  title: string;
  items: { key: string; label: string; desc?: string }[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: "帖子",
    items: [
      { key: "topic.create", label: "发帖" },
      { key: "topic.edit_own", label: "编辑自己的帖子" },
      { key: "topic.edit_any", label: "编辑任何帖子" },
      { key: "topic.delete_own", label: "删除自己的帖子" },
      { key: "topic.delete_any", label: "删除任何帖子" },
      { key: "topic.lock", label: "锁帖" },
      { key: "topic.pin", label: "置顶" },
      { key: "topic.feature", label: "标记精华" },
    ],
  },
  {
    title: "回复",
    items: [
      { key: "reply.create", label: "回复" },
      { key: "reply.edit_own", label: "编辑自己的回复" },
      { key: "reply.edit_any", label: "编辑任何回复" },
      { key: "reply.delete_own", label: "删除自己的回复" },
      { key: "reply.delete_any", label: "删除任何回复" },
      { key: "reply.vote", label: "点赞/点踩（计入排序）" },
    ],
  },
  {
    title: "匿名区",
    items: [
      { key: "anon.view", label: "查看匿名区" },
      { key: "anon.post", label: "在匿名区发言" },
      { key: "anon.audit", label: "查看匿名追溯（真实账号）", desc: "仅管理员权限" },
    ],
  },
  {
    title: "用户",
    items: [
      { key: "user.warn", label: "警告用户" },
      { key: "user.mute", label: "静音用户" },
      { key: "user.ban", label: "封禁用户" },
      { key: "user.credit_adjust", label: "调整信用分" },
      { key: "user.role_assign", label: "分配角色" },
    ],
  },
  {
    title: "Bot",
    items: [
      { key: "bot.create_private", label: "创建私有 Bot" },
      { key: "bot.publish_public", label: "发布公开 Bot" },
      { key: "bot.review", label: "审核 Bot 申请" },
      { key: "bot.suspend", label: "暂停 / 禁用 Bot" },
      { key: "bot.view_logs", label: "查看 Bot 调用日志" },
    ],
  },
  {
    title: "治理",
    items: [
      { key: "moderation.report_handle", label: "处理举报" },
      { key: "moderation.content_review", label: "审核待审内容" },
      { key: "moderation.filter_manage", label: "管理敏感词过滤规则" },
    ],
  },
  {
    title: "站点",
    items: [
      { key: "site.settings", label: "修改站点设置" },
      { key: "site.categories", label: "管理板块" },
      { key: "site.announcements", label: "管理公告" },
      { key: "site.llm", label: "配置 LLM 与成本预算" },
      { key: "site.audit_view", label: "查看操作审计日志" },
    ],
  },
];

const ALL_PERMS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

function makePerms(keys: string[]): Record<string, boolean> {
  const obj: Record<string, boolean> = {};
  for (const k of ALL_PERMS) obj[k] = keys.includes(k);
  return obj;
}

const INITIAL_ROLES: Role[] = [
  {
    key: "guest",
    label: "游客",
    description: "未登录访客，只能浏览公开内容",
    builtin: true,
    color: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
    userCount: 0,
    permissions: makePerms([]),
  },
  {
    key: "user",
    label: "普通用户",
    description: "注册用户的默认角色",
    builtin: true,
    color: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    userCount: 1238,
    permissions: makePerms([
      "topic.create",
      "topic.edit_own",
      "topic.delete_own",
      "reply.create",
      "reply.edit_own",
      "reply.delete_own",
      "reply.vote",
    ]),
  },
  {
    key: "trusted",
    label: "高信用用户",
    description: "信用分 > 500，可进入匿名区和创建私有 Bot",
    builtin: true,
    color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    userCount: 87,
    permissions: makePerms([
      "topic.create",
      "topic.edit_own",
      "topic.delete_own",
      "reply.create",
      "reply.edit_own",
      "reply.delete_own",
      "reply.vote",
      "anon.view",
      "anon.post",
      "bot.create_private",
    ]),
  },
  {
    key: "developer",
    label: "开发者",
    description: "可以发布公开 Bot",
    builtin: true,
    color: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    userCount: 12,
    permissions: makePerms([
      "topic.create",
      "topic.edit_own",
      "topic.delete_own",
      "reply.create",
      "reply.edit_own",
      "reply.delete_own",
      "reply.vote",
      "anon.view",
      "anon.post",
      "bot.create_private",
      "bot.publish_public",
    ]),
  },
  {
    key: "moderator",
    label: "板主",
    description: "管理所分配板块的内容",
    builtin: true,
    color: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    userCount: 6,
    permissions: makePerms([
      "topic.create",
      "topic.edit_own",
      "topic.edit_any",
      "topic.delete_own",
      "topic.delete_any",
      "topic.lock",
      "topic.pin",
      "topic.feature",
      "reply.create",
      "reply.edit_own",
      "reply.edit_any",
      "reply.delete_own",
      "reply.delete_any",
      "reply.vote",
      "anon.view",
      "anon.post",
      "user.warn",
      "user.mute",
      "moderation.report_handle",
      "moderation.content_review",
    ]),
  },
  {
    key: "admin",
    label: "超级管理员",
    description: "所有权限，包括站点配置",
    builtin: true,
    color: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    userCount: 2,
    permissions: makePerms(ALL_PERMS),
  },
  {
    key: "bot",
    label: "Bot 账号",
    description: "AI 智能体身份，特殊限制（点赞不计入、不进匿名区）",
    builtin: true,
    color: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
    userCount: 6,
    permissions: makePerms(["reply.create", "topic.edit_own"]),
  },
];

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<Role[]>(INITIAL_ROLES);
  const [activeKey, setActiveKey] = useState<RoleKey>("user");
  const [creating, setCreating] = useState<Role | null>(null);

  const active = roles.find((r) => r.key === activeKey);

  function togglePerm(roleKey: RoleKey, permKey: string) {
    setRoles((prev) =>
      prev.map((r) =>
        r.key === roleKey
          ? { ...r, permissions: { ...r.permissions, [permKey]: !r.permissions[permKey] } }
          : r,
      ),
    );
  }

  function cloneRole(role: Role) {
    const newKey = `${role.key}_copy`;
    const newRole: Role = {
      ...role,
      key: newKey,
      label: `${role.label} (副本)`,
      description: `克隆自 ${role.label}`,
      builtin: false,
      userCount: 0,
      permissions: { ...role.permissions },
    };
    setCreating(newRole);
  }

  function startCreate() {
    setCreating({
      key: "",
      label: "",
      description: "",
      builtin: false,
      color: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
      userCount: 0,
      permissions: makePerms([]),
    });
  }

  function saveNewRole() {
    if (!creating || !creating.key.trim() || !creating.label.trim()) return;
    setRoles([...roles, creating]);
    setActiveKey(creating.key);
    setCreating(null);
  }

  function removeRole(key: RoleKey) {
    const r = roles.find((x) => x.key === key);
    if (!r || r.builtin) return;
    if (!confirm(`删除角色「${r.label}」？`)) return;
    setRoles(roles.filter((x) => x.key !== key));
    if (activeKey === key) setActiveKey("user");
  }

  const grantedCount = active
    ? Object.values(active.permissions).filter(Boolean).length
    : 0;
  const totalCount = ALL_PERMS.length;

  return (
    <>
      <AdminHeader
        title="角色权限"
        subtitle={`${roles.length} 个角色 · ${roles.filter((r) => r.builtin).length} 内置 · ${roles.filter((r) => !r.builtin).length} 自定义`}
        actions={
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            + 新建角色
          </button>
        }
      />

      <div className="flex">
        <aside className="w-64 shrink-0 border-r border-border bg-card">
          <div className="p-2">
            {roles.map((r) => {
              const active = activeKey === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setActiveKey(r.key)}
                  className={`mb-1 flex w-full items-start gap-2 rounded-md border p-3 text-left transition ${
                    active
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-accent"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.color}`}>
                        {r.label}
                      </span>
                      {r.builtin ? (
                        <span className="rounded bg-muted px-1 text-[9px] font-medium text-muted-foreground">
                          内置
                        </span>
                      ) : (
                        <span className="rounded bg-primary/15 px-1 text-[9px] font-medium text-primary">
                          自定义
                        </span>
                      )}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {r.description}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {r.userCount} 用户 · {Object.values(r.permissions).filter(Boolean).length}/{totalCount} 权限
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-8 py-6">
          {active ? (
            <>
              <div className="mb-5 flex items-start justify-between border-b border-border pb-4">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <h2 className="text-xl font-bold text-foreground">{active.label}</h2>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${active.color}`}>
                      {active.key}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{active.description}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {grantedCount} / {totalCount} 权限启用 · 绑定 {active.userCount} 用户
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => cloneRole(active)}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
                  >
                    克隆
                  </button>
                  {!active.builtin && (
                    <button
                      type="button"
                      onClick={() => removeRole(active.key)}
                      className="rounded-md border border-rose-500/40 bg-card px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>

              {active.builtin && active.key === "admin" && (
                <div className="mb-5 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300">
                  ⚠ 超级管理员拥有所有权限，包括站点配置和财务。慎重分配。
                </div>
              )}

              {active.builtin && (
                <div className="mb-5 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-700 dark:text-blue-300">
                  ℹ 这是内置角色。修改内置角色的权限会影响整个社区。如需定制，建议「克隆」后再编辑。
                </div>
              )}

              <div className="space-y-5">
                {PERMISSION_GROUPS.map((group) => {
                  const groupKeys = group.items.map((i) => i.key);
                  const groupGranted = groupKeys.filter(
                    (k) => active.permissions[k],
                  ).length;
                  return (
                    <section
                      key={group.title}
                      className="overflow-hidden rounded-lg border border-border bg-card"
                    >
                      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {group.title}
                        </h3>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {groupGranted} / {groupKeys.length}
                        </span>
                      </div>
                      <div className="divide-y divide-border">
                        {group.items.map((perm) => (
                          <label
                            key={perm.key}
                            className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-accent/30"
                          >
                            <input
                              type="checkbox"
                              checked={active.permissions[perm.key] ?? false}
                              onChange={() => togglePerm(active.key, perm.key)}
                              className="mt-0.5 h-4 w-4 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-foreground">{perm.label}</div>
                              {perm.desc && (
                                <div className="mt-0.5 text-[11px] text-muted-foreground">
                                  {perm.desc}
                                </div>
                              )}
                              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                                {perm.key}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-border pt-5">
                <button className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent">
                  重置
                </button>
                <button className="rounded-md bg-primary px-5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
                  保存角色权限
                </button>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              选择一个角色查看权限
            </div>
          )}
        </div>
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-foreground">
              {creating.key.endsWith("_copy") ? "克隆角色" : "新建角色"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">
                  角色 Key <span className="text-muted-foreground">(唯一标识)</span>
                </label>
                <input
                  value={creating.key}
                  onChange={(e) => setCreating({ ...creating, key: e.target.value })}
                  placeholder="tech_moderator"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">
                  显示名称
                </label>
                <input
                  value={creating.label}
                  onChange={(e) => setCreating({ ...creating, label: e.target.value })}
                  placeholder="技术板主"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">
                  描述
                </label>
                <textarea
                  value={creating.description}
                  onChange={(e) =>
                    setCreating({ ...creating, description: e.target.value })
                  }
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                />
              </div>

              <div className="rounded-md border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
                创建后将进入权限编辑界面，你可以勾选具体权限。
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setCreating(null)}
                className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveNewRole}
                disabled={!creating.key.trim() || !creating.label.trim()}
                className="rounded-md bg-primary px-5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
