"use client";

import { useState } from "react";
import { MarkdownRenderer } from "@/components/markdown/MarkdownRenderer";

export function CategoryRulesCard({ rules }: { rules: string }) {
  const [open, setOpen] = useState(false);
  const trimmed = rules.trim();
  if (!trimmed) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-semibold text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
      >
        <span>📜 本板规则</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {open ? "收起 ▾" : "展开 ▸"}
        </span>
      </button>
      {open && (
        <div className="border-t border-amber-500/30 px-4 py-3 text-xs text-foreground">
          <MarkdownRenderer content={trimmed} />
        </div>
      )}
    </div>
  );
}
