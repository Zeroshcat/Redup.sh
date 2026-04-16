"use client";

import { useCallback, useRef, useState } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { uploadFile, type ServerAttachment } from "@/lib/api/upload";
import dynamic from "next/dynamic";

// Dynamically import emoji picker to avoid SSR issues and reduce bundle size.
const EmojiPicker = dynamic(() => import("emoji-picker-react"), { ssr: false });

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Called when files are uploaded during editing; parent tracks IDs for submission. */
  onAttachmentsChange?: (attachments: ServerAttachment[]) => void;
}

type Mode = "write" | "preview" | "split";

const TOOLBAR = [
  { label: "B", wrap: "**", title: "Bold" },
  { label: "I", wrap: "*", title: "Italic" },
  { label: "S", wrap: "~~", title: "Strikethrough" },
  { label: "`", wrap: "`", title: "Inline code" },
];

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Support Markdown. @ to summon Bot...",
  minHeight = 240,
  onAttachmentsChange,
}: Props) {
  const [mode, setMode] = useState<Mode>("write");
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<ServerAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notify parent whenever attachment list changes.
  const updateAttachments = useCallback(
    (next: ServerAttachment[]) => {
      setAttachments(next);
      onAttachmentsChange?.(next);
    },
    [onAttachmentsChange],
  );

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

  function insertAtCursor(text: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const next = value.slice(0, start) + text + value.slice(ta.selectionEnd);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  // --- Upload ---

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const att = await uploadFile(file);
      updateAttachments([...attachments, att]);
      // Insert markdown reference into editor.
      const md = att.mime_type.startsWith("video/")
        ? `\n![${att.file_name}](${att.url})\n`
        : `\n![${att.file_name}](${att.url})\n`;
      insertAtCursor(md);
    } catch {
      // Silently fail — could add error state if needed.
    } finally {
      setUploading(false);
    }
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    handleUpload(files[0]);
    // Reset so the same file can be re-selected.
    e.target.value = "";
  }

  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/") && item.kind === "file") {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleUpload(file);
        return;
      }
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function removeAttachment(id: number) {
    updateAttachments(attachments.filter((a) => a.id !== id));
  }

  function onEmojiSelect(emojiData: { emoji: string }) {
    insertAtCursor(emojiData.emoji);
    setShowEmoji(false);
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
            title="Heading"
            onClick={() => insertBlock("## ")}
            className="h-7 rounded px-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            H
          </button>
          <button
            type="button"
            title="List"
            onClick={() => insertBlock("- ")}
            className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {"\u2022"}
          </button>
          <button
            type="button"
            title="Quote"
            onClick={() => insertBlock("> ")}
            className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {"\u275D"}
          </button>
          <button
            type="button"
            title="Code block"
            onClick={() => insertBlock("```\n\n```\n")}
            className="h-7 rounded px-2 text-xs font-mono text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {"{}"}
          </button>
          <button
            type="button"
            title="Link"
            onClick={() => wrapSelection("[", "](url)")}
            className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {"\uD83D\uDD17"}
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
          {/* Upload button */}
          <button
            type="button"
            title="Upload image/video"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            {uploading ? "\u23F3" : "\uD83D\uDDBC"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={onFileInputChange}
          />
          {/* Emoji button */}
          <div className="relative">
            <button
              type="button"
              title="Emoji"
              onClick={() => setShowEmoji(!showEmoji)}
              className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {"\uD83D\uDE0A"}
            </button>
            {showEmoji && (
              <div className="absolute top-full left-0 z-50 mt-1">
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowEmoji(false)}
                />
                <div className="relative z-50">
                  <EmojiPicker
                    onEmojiClick={onEmojiSelect}
                    width={320}
                    height={400}
                    searchDisabled={false}
                    skinTonesDisabled
                    previewConfig={{ showPreview: false }}
                  />
                </div>
              </div>
            )}
          </div>
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
              {m === "write" ? "Write" : m === "split" ? "Split" : "Preview"}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex"
        style={{ minHeight }}
        onDrop={onDrop}
        onDragOver={onDragOver}
      >
        {(mode === "write" || mode === "split") && (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={onPaste}
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
              <div className="text-sm text-muted-foreground">
                Preview area
              </div>
            )}
          </div>
        )}
      </div>

      {/* Attachment thumbnails */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border bg-muted/20 px-3 py-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="group relative flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {a.mime_type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.url}
                  alt={a.file_name}
                  className="h-8 w-8 rounded object-cover"
                />
              ) : (
                <span className="text-muted-foreground">
                  {a.mime_type.startsWith("video/") ? "\uD83C\uDFAC" : "\uD83D\uDCC4"}
                </span>
              )}
              <span className="max-w-[100px] truncate text-muted-foreground">
                {a.file_name}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                {"\u00D7"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
        Support{" "}
        <span className="font-mono">**bold**</span>{" "}
        <span className="font-mono">`code`</span>{" "}
        <span className="font-mono">[link](url)</span> | GFM tables | Code
        highlight | <span className="font-mono">@Bot</span> summon | Paste
        or drag to upload
      </div>
    </div>
  );
}
