"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import { listAuditLogs, type ServerAuditLog } from "@/lib/api/audit";
import { timeAgo } from "@/lib/utils-time";

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
  "topic.lock": { label: "锁定主题", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  "topic.unlock": { label: "解锁主题", cls: "bg-muted text-muted-foreground" },
  "topic.pin": { label: "设置置顶", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  "topic.feature": { label: "设为精华", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  "topic.unfeature": { label: "取消精华", cls: "bg-muted text-muted-foreground" },
  "topic.delete": { label: "删除主题", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  "post.delete": { label: "删除回帖", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  "user.ban": { label: "封禁用户", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  "user.unban": { label: "解封用户", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  "report.resolve": { label: "确认违规", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  "report.dismiss": { label: "驳回举报", cls: "bg-muted text-muted-foreground" },
  "category.create": { label: "创建板块", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  "category.update": { label: "修改板块", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  "category.delete": { label: "删除板块", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  "category.move": { label: "调整板块顺序", cls: "bg-muted text-muted-foreground" },
  "site.update": { label: "修改站点设置", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  "bot.create": { label: "创建 Bot", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  "bot.approve": { label: "审核通过", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  "bot.reject": { label: "驳回 Bot", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  "bot.suspend": { label: "暂停 Bot", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  "bot.feature": { label: "Bot 精选", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  "bot.delete": { label: "删除 Bot", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  "bot.summon": { label: "召唤 Bot", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  "bot.moderator.enable": { label: "Bot 设为审核员", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  "bot.moderator.disable": { label: "取消 Bot 审核员", cls: "bg-muted text-muted-foreground" },
  "bot.token.issue": { label: "签发 Token", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  "bot.token.revoke": { label: "吊销 Token", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  "skill.topic.read": { label: "Skill 读主题", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  "skill.topic.posts.read": { label: "Skill 读楼层", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  "skill.topic.reply.write": { label: "Skill 发回复", cls: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  "skill.search": { label: "Skill 搜索", cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
};

const TARGET_LABEL: Record<string, string> = {
  topic: "主题",
  post: "回帖",
  user: "用户",
  report: "举报",
  category: "板块",
  site: "站点",
  bot: "Bot",
};

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部动作" },
  { value: "topic.lock", label: "锁定主题" },
  { value: "topic.unlock", label: "解锁主题" },
  { value: "topic.pin", label: "置顶" },
  { value: "topic.feature", label: "设为精华" },
  { value: "topic.delete", label: "删除主题" },
  { value: "post.delete", label: "删除回帖" },
  { value: "user.ban", label: "封禁用户" },
  { value: "user.unban", label: "解封用户" },
  { value: "report.resolve", label: "确认违规" },
  { value: "report.dismiss", label: "驳回举报" },
  { value: "category.create", label: "创建板块" },
  { value: "category.update", label: "修改板块" },
  { value: "category.delete", label: "删除板块" },
  { value: "category.move", label: "调整板块顺序" },
  { value: "site.update", label: "修改站点设置" },
  { value: "bot.create", label: "创建 Bot" },
  { value: "bot.approve", label: "审核通过 Bot" },
  { value: "bot.reject", label: "驳回 Bot" },
  { value: "bot.suspend", label: "暂停 Bot" },
];

const TARGET_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "全部对象" },
  { value: "topic", label: "主题" },
  { value: "post", label: "回帖" },
  { value: "user", label: "用户" },
  { value: "report", label: "举报" },
  { value: "category", label: "板块" },
  { value: "site", label: "站点" },
  { value: "bot", label: "Bot" },
];

function actionBadge(action: string) {
  const cfg = ACTION_LABEL[action];
  if (cfg) {
    return (
      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cfg.cls}`}>
        {cfg.label}
      </span>
    );
  }
  return (
    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
      {action}
    </span>
  );
}

function targetHref(log: ServerAuditLog): string | null {
  if (log.target_id <= 0) return null;
  switch (log.target_type) {
    case "topic":
    case "post":
      return `/topic/${log.target_id}`;
    case "user":
      return log.target_label
        ? `/u/${log.target_label.replace(/^@\s*/, "")}`
        : null;
    default:
      return null;
  }
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<ServerAuditLog[] | null>(null);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    try {
      const resp = await listAuditLogs({
        action: actionFilter || undefined,
        target_type: targetFilter || undefined,
        limit: 200,
      });
      setLogs(resp.items);
      setTotal(resp.total);
      setError(null);
    } catch (err) {
      if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
      else setError("请求失败");
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter, targetFilter]);

  return (
    <>
      <AdminHeader
        title="操作日志"
        subtitle={
          logs
            ? `共 ${total} 条记录 · 当前页 ${logs.length} 条`
            : "所有管理员操作的完整审计记录（谁 / 什么时候 / 做了什么）"
        }
        actions={
          <>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={targetFilter}
              onChange={(e) => setTargetFilter(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            >
              {TARGET_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </>
        }
      />

      <div className="px-8 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {!logs && !error ? (
          <div className="text-sm text-muted-foreground">正在加载…</div>
        ) : logs && logs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            没有符合条件的操作记录
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">操作员</th>
                  <th className="px-4 py-2.5 text-left font-medium">动作</th>
                  <th className="px-4 py-2.5 text-left font-medium">对象类型</th>
                  <th className="px-4 py-2.5 text-left font-medium">对象</th>
                  <th className="px-4 py-2.5 text-left font-medium">详情 / IP</th>
                  <th className="px-4 py-2.5 text-right font-medium">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs?.map((log) => {
                  const href = targetHref(log);
                  return (
                    <tr key={log.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3">
                        {log.actor_username ? (
                          <Link
                            href={`/u/${log.actor_username}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            @{log.actor_username}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">系统</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{actionBadge(log.action)}</td>
                      <td className="px-4 py-3 text-[11px] text-muted-foreground">
                        {TARGET_LABEL[log.target_type] ?? log.target_type ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-foreground">
                        {href ? (
                          <Link
                            href={href}
                            className="line-clamp-1 hover:underline"
                            title={log.target_label}
                          >
                            {log.target_label || `#${log.target_id}`}
                          </Link>
                        ) : (
                          <span className="line-clamp-1" title={log.target_label}>
                            {log.target_label || `#${log.target_id}`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {log.detail || "—"}
                        {log.ip && (
                          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/70">
                            {log.ip}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                        <div>{timeAgo(log.created_at)}</div>
                        <div className="mt-0.5 font-mono text-[10px]">
                          {new Date(log.created_at).toLocaleString("zh-CN")}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
