interface Props {
  level?: number;
  className?: string;
}

const STYLES: Record<number, { label: string; cls: string; title: string }> = {
  1: {
    label: "置顶",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    title: "板块置顶",
  },
  2: {
    label: "区置顶",
    cls: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    title: "分类置顶（同类型板块）",
  },
  3: {
    label: "全站置顶",
    cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    title: "全站置顶",
  },
};

export function PinBadge({ level, className = "" }: Props) {
  if (!level || level <= 0) return null;
  const s = STYLES[level] ?? STYLES[1];
  return (
    <span
      title={s.title}
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.cls} ${className}`}
    >
      {s.label}
    </span>
  );
}
