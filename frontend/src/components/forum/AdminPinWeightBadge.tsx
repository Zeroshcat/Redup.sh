"use client";

import { useAuthStore } from "@/store/auth";

interface Props {
  level?: number;
  weight?: number;
}

export function AdminPinWeightBadge({ level, weight }: Props) {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== "admin") return null;
  if (!level || level <= 0) return null;
  return (
    <span
      title="置顶权重（同级内从大到小排，仅管理员可见）"
      className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-700 dark:text-amber-300"
    >
      w{weight ?? 0}
    </span>
  );
}
