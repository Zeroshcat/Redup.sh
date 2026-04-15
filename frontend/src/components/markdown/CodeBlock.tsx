"use client";

import { useState, type ReactElement, type ReactNode } from "react";

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    return extractText((node as ReactElement<{ children?: ReactNode }>).props.children);
  }
  return "";
}

export function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);

  const codeEl = children as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
  const className = codeEl?.props?.className ?? "";
  const lang = className.match(/language-([\w-]+)/)?.[1] ?? "";
  const text = extractText(codeEl?.props?.children).replace(/\n$/, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — some browsers block clipboard on insecure origins
    }
  }

  return (
    <div className="group relative my-4 overflow-hidden rounded-md bg-muted/40 dark:bg-white/[0.03]">
      {lang && (
        <span className="pointer-events-none absolute left-3 top-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/60">
          {lang}
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded px-2 py-0.5 text-[11px] font-medium text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
      >
        {copied ? "✓ 已复制" : "📋 复制"}
      </button>
      <pre className="overflow-x-auto px-4 pb-4 pt-7 text-[13px] leading-relaxed text-foreground">
        {children}
      </pre>
    </div>
  );
}
