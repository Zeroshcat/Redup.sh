"use client";

import { useRef, useState } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
}

type Mode = "write" | "preview" | "split";

const TOOLBAR = [
  { label: "B", wrap: "**", title: "粗体" },
  { label: "I", wrap: "*", title: "斜体" },
  { label: "S", wrap: "~~", title: "删除线" },
  { label: "`", wrap: "`", title: "行内代码" },
];

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "支持 Markdown。输入 @ 可召唤 Bot…",
  minHeight = 240,
}: Props) {
  const [mode, setMode] = useState<Mode>("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function wrapSelection(prefix: string, suffix = prefix) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, end + prefix.length);
    });
  }

  function insertBlock(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const before = value.slice(0, start);
    const atLineStart = before.length === 0 || before.endsWith("\n");
    const lead = atLineStart ? "" : "\n";
    const next = before + lead + prefix + value.slice(start);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + lead.length + prefix.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-2 py-1">
        <div className="flex items-center gap-0.5">
          {TOOLBAR.map((b) => (
            <button
              key={b.label}
              type="button"
              title={b.title}
              onClick={() => wrapSelection(b.wrap)}
              className="h-7 w-7 rounded text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {b.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            title="标题"
            onClick={() => insertBlock("## ")}
            className="h-7 rounded px-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            H
          </button>
          <button
            type="button"
            title="列表"
            onClick={() => insertBlock("- ")}
            className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            •
          </button>
          <button
            type="button"
            title="引用"
            onClick={() => insertBlock("> ")}
            className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            ❝
          </button>
          <button
            type="button"
            title="代码块"
            onClick={() => insertBlock("```\n\n```\n")}
            className="h-7 rounded px-2 text-xs font-mono text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {"{}"}
          </button>
          <button
            type="button"
            title="链接"
            onClick={() => wrapSelection("[", "](url)")}
            className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            🔗
          </button>
        </div>

        <div className="flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5 text-xs">
          {(["write", "split", "preview"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-2 py-0.5 font-medium transition ${
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "write" ? "写" : m === "split" ? "分栏" : "预览"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex" style={{ minHeight }}>
        {(mode === "write" || mode === "split") && (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full resize-none bg-background p-4 font-mono text-sm leading-relaxed outline-none ${
              mode === "split" ? "w-1/2 border-r border-border" : ""
            }`}
            style={{ minHeight }}
          />
        )}

        {(mode === "preview" || mode === "split") && (
          <div
            className={`overflow-auto p-4 ${mode === "split" ? "w-1/2" : "w-full"}`}
            style={{ minHeight }}
          >
            {value.trim() ? (
              <MarkdownRenderer content={value} />
            ) : (
              <div className="text-sm text-muted-foreground">预览区 · 开始写点什么吧</div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
        支持 <span className="font-mono">**粗体**</span>{" "}
        <span className="font-mono">`代码`</span>{" "}
        <span className="font-mono">[链接](url)</span> · GFM 表格 · 代码块高亮 ·{" "}
        <span className="font-mono">@Bot</span> 召唤
      </div>
    </div>
  );
}
