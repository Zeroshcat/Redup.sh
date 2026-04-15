"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { APIError } from "@/lib/api-client";
import {
  adminDeleteTopic,
  adminFeatureTopic,
  adminLockTopic,
  adminPinTopic,
} from "@/lib/api/forum";
import { useAuthStore } from "@/store/auth";

interface Props {
  topicId: number;
  initialPinLevel: number;
  initialPinWeight: number;
  initialLocked: boolean;
  initialFeatured: boolean;
}

const PIN_OPTIONS: { value: number; label: string; hint: string }[] = [
  { value: 0, label: "不置顶", hint: "" },
  { value: 1, label: "板块置顶", hint: "仅在该板块列表中置顶" },
  { value: 2, label: "区置顶", hint: "在同类型的所有板块中置顶" },
  { value: 3, label: "全站置顶", hint: "在所有板块和首页中置顶" },
];

export function TopicAdminBar({
  topicId,
  initialPinLevel,
  initialPinWeight,
  initialLocked,
  initialFeatured,
}: Props) {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const [open, setOpen] = useState(false);
  const [pinLevel, setPinLevel] = useState(initialPinLevel);
  const [pinWeight, setPinWeight] = useState(initialPinWeight);
  const [locked, setLocked] = useState(initialLocked);
  const [featured, setFeatured] = useState(initialFeatured);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sync local state when the dialog opens, in case props changed via SSR.
  useEffect(() => {
    if (open) {
      setPinLevel(initialPinLevel);
      setPinWeight(initialPinWeight);
      setLocked(initialLocked);
      setFeatured(initialFeatured);
      setError(null);
      setSaved(false);
    }
  }, [open, initialPinLevel, initialPinWeight, initialLocked, initialFeatured]);

  if (role !== "admin") return null;

  const dirty =
    pinLevel !== initialPinLevel ||
    pinWeight !== initialPinWeight ||
    locked !== initialLocked ||
    featured !== initialFeatured;

  function handleErr(err: unknown) {
    if (err instanceof APIError) setError(`${err.message} (req ${err.requestId})`);
    else setError("操作失败");
  }

  async function saveAll() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      if (pinLevel !== initialPinLevel || pinWeight !== initialPinWeight) {
        await adminPinTopic(topicId, pinLevel, pinWeight);
      }
      if (locked !== initialLocked) {
        await adminLockTopic(topicId, locked);
      }
      if (featured !== initialFeatured) {
        await adminFeatureTopic(topicId, featured);
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => {
        setOpen(false);
      }, 600);
    } catch (err) {
      handleErr(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("确定删除此主题？操作不可在前台恢复。")) return;
    setBusy(true);
    setError(null);
    try {
      await adminDeleteTopic(topicId);
      setOpen(false);
      router.push("/");
    } catch (err) {
      handleErr(err);
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="管理员操作"
        className="ml-auto inline-flex items-center gap-1 text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
      >
        🛡 管理
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">管理员操作</h3>
              <button
                type="button"
                onClick={() => !busy && setOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <section className="mb-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                置顶
              </div>
              <div className="space-y-1.5">
                {PIN_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 transition ${
                      pinLevel === o.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="pin-level"
                      checked={pinLevel === o.value}
                      onChange={() => setPinLevel(o.value)}
                      disabled={busy}
                      className="mt-0.5 h-3.5 w-3.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-foreground">{o.label}</div>
                      {o.hint && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{o.hint}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
              {pinLevel > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">权重</label>
                  <input
                    type="number"
                    value={pinWeight}
                    onChange={(e) => setPinWeight(Number(e.target.value))}
                    disabled={busy}
                    className="w-24 rounded-md border border-input bg-background px-2 py-1 font-mono text-xs outline-none focus:border-ring"
                  />
                  <span className="text-[11px] text-muted-foreground">同级内从大到小排</span>
                </div>
              )}
            </section>

            <section className="mb-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                状态
              </div>
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                  <div>
                    <div className="text-xs font-medium text-foreground">设为精华</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      在板块和首页突出展示
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={featured}
                    onChange={(e) => setFeatured(e.target.checked)}
                    disabled={busy}
                    className="h-4 w-4"
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                  <div>
                    <div className="text-xs font-medium text-foreground">锁定主题</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      禁止新回复，已有内容保留
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={locked}
                    onChange={(e) => setLocked(e.target.checked)}
                    disabled={busy}
                    className="h-4 w-4"
                  />
                </label>
              </div>
            </section>

            {error && (
              <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                {error}
              </div>
            )}
            {saved && (
              <div className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
                ✓ 已保存
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="rounded-md border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
              >
                删除主题
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={saveAll}
                  disabled={busy || !dirty}
                  className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? "保存中…" : "保存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
