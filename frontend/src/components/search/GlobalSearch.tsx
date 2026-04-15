"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";

interface QuickHit {
  id: number;
  title: string;
  category_slug?: string;
  reply_count: number;
}

interface QuickResp {
  query: string;
  results: QuickHit[];
}

const DEBOUNCE_MS = 250;

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cmd/Ctrl-K focuses the input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Debounced fetch on query change.
  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const r = await api<QuickResp>(
          `/api/search?q=${encodeURIComponent(query)}&limit=8`,
          { auth: false },
        );
        setResults(r.results);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [results]);

  function gotoFullSearch() {
    router.push(`/search?q=${encodeURIComponent(query)}`);
    setOpen(false);
    inputRef.current?.blur();
  }

  function gotoTopic(id: number) {
    router.push(`/topic/${id}`);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      // If a result is highlighted and we have results, jump to it; otherwise
      // fall back to the full search page so the user always lands somewhere.
      if (results && results.length > 0 && activeIdx < results.length) {
        gotoTopic(results[activeIdx].id);
      } else if (query.trim()) {
        gotoFullSearch();
      }
      return;
    }
    if (!results || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + results.length) % results.length);
    }
  }

  const showPanel = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          ⌕
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="搜索主题…"
          className="w-64 rounded-md border border-input bg-background py-1.5 pl-8 pr-12 text-sm outline-none focus:border-ring"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover shadow-xl">
          {loading ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">搜索中…</div>
          ) : results === null || results.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              没有匹配「<span className="font-mono text-foreground">{query}</span>」的主题
            </div>
          ) : (
            <div className="py-1">
              {results.map((r, idx) => {
                const active = idx === activeIdx;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => gotoTopic(r.id)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left transition ${
                      active ? "bg-accent" : ""
                    }`}
                  >
                    <span className="mt-0.5 text-sm">📝</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">
                        {highlight(r.title, query)}
                      </div>
                      {r.category_slug && (
                        <div className="font-mono text-[10px] text-muted-foreground">
                          /{r.category_slug} · 💬 {r.reply_count}
                        </div>
                      )}
                    </div>
                    {active && (
                      <kbd className="mt-0.5 rounded border border-border bg-background px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                        ↵
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={gotoFullSearch}
            className="block w-full border-t border-border px-4 py-2 text-center text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            查看全部结果 →
          </button>
        </div>
      )}
    </div>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-foreground">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}
