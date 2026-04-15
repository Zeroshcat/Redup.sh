"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { APIError } from "@/lib/api-client";
import {
  adminGetLLMProviders,
  adminGetLLMStats,
  adminListLLMCalls,
  type LLMCallStatus,
  type LLMStatRow,
  type ServerLLMCall,
} from "@/lib/api/llm";
import { timeAgo } from "@/lib/utils-time";

const PAGE_SIZE = 50;

function errorMessage(err: unknown): string {
  if (err instanceof APIError) return `${err.message} (req ${err.requestId})`;
  return "请求失败";
}

function statusClass(s: LLMCallStatus): string {
  return s === "success"
    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : "bg-rose-500/15 text-rose-600 dark:text-rose-400";
}

export default function AdminLLMPage() {
  const [calls, setCalls] = useState<ServerLLMCall[] | null>(null);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<LLMStatRow[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [filterProvider, setFilterProvider] = useState("");
  const [filterFeature, setFilterFeature] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | LLMCallStatus>("");
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [listResp, statsResp, providersResp] = await Promise.all([
        adminListLLMCalls({
          provider: filterProvider || undefined,
          feature: filterFeature || undefined,
          status: filterStatus || undefined,
          limit: PAGE_SIZE,
          offset,
        }),
        adminGetLLMStats(),
        adminGetLLMProviders(),
      ]);
      setCalls(listResp.items);
      setTotal(listResp.total);
      setStats(statsResp.items ?? []);
      setProviders(providersResp.providers ?? []);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [filterProvider, filterFeature, filterStatus, offset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch whose resolution updates state
    reload();
  }, [reload]);

  const totalCalls = stats.reduce((acc, s) => acc + s.calls, 0);
  const totalErrors = stats.reduce((acc, s) => acc + s.errors, 0);
  const errorRate = totalCalls === 0 ? 0 : (totalErrors / totalCalls) * 100;
  const totalReqChars = stats.reduce((acc, s) => acc + s.total_req_chars, 0);
  const totalRespChars = stats.reduce((acc, s) => acc + s.total_resp_chars, 0);

  return (
    <>
      <AdminHeader
        title="LLM 调用监控"
        subtitle={
          calls === null
            ? "加载中…"
            : `${totalCalls.toLocaleString()} 次调用 · ${errorRate.toFixed(1)}% 错误率`
        }
      />

      <div className="px-8 py-6">
        {error && (
          <div className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="累计调用" value={totalCalls.toLocaleString()} accent="text-foreground" />
          <StatCard
            label="错误率"
            value={`${errorRate.toFixed(1)}%`}
            accent={errorRate > 5 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}
          />
          <StatCard label="输入字符" value={totalReqChars.toLocaleString()} accent="text-blue-600 dark:text-blue-400" />
          <StatCard label="输出字符" value={totalRespChars.toLocaleString()} accent="text-blue-600 dark:text-blue-400" />
        </section>

        <section className="mb-6 overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div className="text-xs font-semibold text-foreground">按 provider / model 聚合</div>
            {providers.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
                已接入：
                <span className="font-mono text-foreground">{providers.join(", ")}</span>
              </div>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Provider</th>
                <th className="px-4 py-2 text-left font-medium">Model</th>
                <th className="px-4 py-2 text-right font-medium">次数</th>
                <th className="px-4 py-2 text-right font-medium">错误</th>
                <th className="px-4 py-2 text-right font-medium">平均延迟</th>
                <th className="px-4 py-2 text-right font-medium">输入</th>
                <th className="px-4 py-2 text-right font-medium">输出</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    {calls === null ? "加载中…" : "暂无调用记录"}
                  </td>
                </tr>
              ) : (
                stats.map((s) => {
                  const rate = s.calls === 0 ? 0 : (s.errors / s.calls) * 100;
                  return (
                    <tr key={`${s.provider}/${s.model}`}>
                      <td className="px-4 py-2 font-mono text-xs text-foreground">{s.provider}</td>
                      <td className="px-4 py-2 font-mono text-xs text-foreground">{s.model}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-foreground">
                        {s.calls.toLocaleString()}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-mono text-xs ${
                          s.errors > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                        }`}
                      >
                        {s.errors.toLocaleString()}
                        {s.errors > 0 && <span className="ml-1 text-[10px]">({rate.toFixed(1)}%)</span>}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {Math.round(s.avg_latency_ms)}ms
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {s.total_req_chars.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {s.total_resp_chars.toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={filterProvider}
              onChange={(e) => {
                setFilterProvider(e.target.value);
                setOffset(0);
              }}
              placeholder="provider"
              className="w-32 rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
            />
            <input
              type="text"
              value={filterFeature}
              onChange={(e) => {
                setFilterFeature(e.target.value);
                setOffset(0);
              }}
              placeholder="feature"
              className="w-32 rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
            />
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value as typeof filterStatus);
                setOffset(0);
              }}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:border-ring"
            >
              <option value="">全部状态</option>
              <option value="success">成功</option>
              <option value="error">失败</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setFilterProvider("");
                setFilterFeature("");
                setFilterStatus("");
                setOffset(0);
              }}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
            >
              清空筛选
            </button>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
              >
                ← 上一页
              </button>
              <span className="font-mono">
                {total === 0 ? 0 : offset + 1}–{Math.min(total, offset + PAGE_SIZE)} / {total}
              </span>
              <button
                type="button"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-40"
              >
                下一页 →
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">状态</th>
                  <th className="px-4 py-2 text-left font-medium">Feature</th>
                  <th className="px-4 py-2 text-left font-medium">Provider</th>
                  <th className="px-4 py-2 text-left font-medium">Model</th>
                  <th className="px-4 py-2 text-right font-medium">延迟</th>
                  <th className="px-4 py-2 text-right font-medium">输入</th>
                  <th className="px-4 py-2 text-right font-medium">输出</th>
                  <th className="px-4 py-2 text-left font-medium">错误信息</th>
                  <th className="px-4 py-2 text-right font-medium">时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {calls === null ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-xs text-muted-foreground">
                      加载中…
                    </td>
                  </tr>
                ) : calls.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-xs text-muted-foreground">
                      没有符合条件的调用
                    </td>
                  </tr>
                ) : (
                  calls.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusClass(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-foreground">{c.feature || "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs text-foreground">{c.provider}</td>
                      <td className="px-4 py-2 font-mono text-xs text-foreground">{c.model}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">{c.latency_ms}ms</td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {c.request_chars.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                        {c.response_chars.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-xs text-rose-600 dark:text-rose-400">
                        <div className="line-clamp-1 max-w-[24rem]">{c.error_message || "—"}</div>
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                        {timeAgo(c.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}
