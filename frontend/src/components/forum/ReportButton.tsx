"use client";

import { useState } from "react";
import { APIError } from "@/lib/api-client";
import {
  submitReport,
  type ReportReason,
  type ReportTargetType,
} from "@/lib/api/reports";
import { useAuthStore } from "@/store/auth";

const REASONS: { value: ReportReason; label: string; hint: string }[] = [
  { value: "spam", label: "垃圾广告", hint: "营销、引流、刷屏" },
  { value: "harassment", label: "骚扰辱骂", hint: "人身攻击、歧视、骚扰" },
  { value: "illegal", label: "违法违规", hint: "违反法律法规或社区底线" },
  { value: "privacy", label: "隐私泄露", hint: "未经授权的个人信息" },
  { value: "other", label: "其他", hint: "请在描述中说明" },
];

const ERROR_MESSAGES: Record<string, string> = {
  report_duplicate: "你已经举报过这条内容，请等待管理员处理",
  invalid_reason: "请选择一个举报原因",
  invalid_target: "举报目标无效",
  description_too_long: "补充描述请控制在 500 字以内",
  unauthorized: "请先登录后再举报",
};

interface Props {
  targetType: ReportTargetType;
  targetId: number;
  targetTitle: string;
}

export function ReportButton({ targetType, targetId, targetTitle }: Props) {
  const isAuthed = useAuthStore((s) => Boolean(s.user));
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setReason("");
    setDescription("");
    setError(null);
    setDone(false);
    setSubmitting(false);
  }

  function close() {
    setOpen(false);
    setTimeout(reset, 200);
  }

  async function submit() {
    if (!reason) {
      setError("请选择一个举报原因");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitReport({
        target_type: targetType,
        target_id: targetId,
        target_title: targetTitle,
        reason,
        description: description.trim() || undefined,
      });
      setDone(true);
    } catch (err) {
      if (err instanceof APIError) {
        setError(`${ERROR_MESSAGES[err.code] ?? err.message} (req ${err.requestId})`);
      } else {
        setError("提交失败，请稍后重试");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!isAuthed) {
            alert("请先登录后再举报");
            return;
          }
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        🚩 举报
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-base font-semibold text-foreground">举报内容</h3>
            <p className="mb-4 line-clamp-1 text-xs text-muted-foreground">
              {targetTitle || `${targetType} #${targetId}`}
            </p>

            {done ? (
              <>
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                  ✓ 已提交，管理员会尽快复核。感谢你帮助维护社区。
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-md bg-primary px-5 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    关闭
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4 space-y-2">
                  {REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
                        reason === r.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        checked={reason === r.value}
                        onChange={() => setReason(r.value)}
                        className="mt-0.5 h-3.5 w-3.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground">{r.label}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{r.hint}</div>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    补充描述（可选）
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="提供更多上下文有助于管理员判断"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring"
                  />
                  <div className="mt-1 text-right text-[10px] text-muted-foreground">
                    {description.length} / 500
                  </div>
                </div>

                {error && (
                  <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={close}
                    disabled={submitting}
                    className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-40"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting || !reason}
                    className="rounded-md bg-rose-600 px-5 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                  >
                    {submitting ? "提交中…" : "提交举报"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
