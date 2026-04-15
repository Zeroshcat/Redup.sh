"use client";

import { useState } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { translateContent, type TargetLang, type TranslateResult } from "@/lib/translate";

const LANG_LABEL: Record<TargetLang, string> = {
  en: "English",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
};

export function TranslatableContent({
  content,
  defaultTargetLang = "en",
}: {
  content: string;
  defaultTargetLang?: TargetLang;
}) {
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState<TargetLang>(defaultTargetLang);

  async function handleTranslate(lang: TargetLang = targetLang) {
    setLoading(true);
    setError(null);
    try {
      const r = await translateContent(content, lang);
      setResult(r);
      setTargetLang(lang);
      setShowTranslation(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "翻译失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <MarkdownRenderer content={showTranslation && result ? result.translated : content} />

      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        {!result && !loading && (
          <button
            type="button"
            onClick={() => handleTranslate()}
            className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            🌐 翻译为 {LANG_LABEL[targetLang]}
          </button>
        )}

        {loading && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            正在翻译…
          </span>
        )}

        {error && (
          <span className="text-rose-600 dark:text-rose-400">❌ {error}</span>
        )}

        {result && (
          <>
            <button
              type="button"
              onClick={() => setShowTranslation((v) => !v)}
              className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {showTranslation ? "📄 显示原文" : `🌐 显示译文（${LANG_LABEL[result.targetLang]}）`}
            </button>

            <details className="group relative">
              <summary className="cursor-pointer list-none rounded border border-border bg-card px-2 py-0.5 hover:bg-accent hover:text-foreground">
                切换语言 ›
              </summary>
              <div className="absolute left-0 top-6 z-20 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                {(Object.keys(LANG_LABEL) as TargetLang[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                      handleTranslate(lang);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-[11px] hover:bg-accent ${
                      lang === result.targetLang ? "font-semibold text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {LANG_LABEL[lang]}
                  </button>
                ))}
              </div>
            </details>

            {showTranslation && (
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {result.cached ? (
                  <>缓存命中 · {result.provider} · {result.model}</>
                ) : result.charged > 0 ? (
                  <>扣 {result.charged} · {result.provider} · {result.model} · {result.latencyMs}ms</>
                ) : (
                  <>免费余 {result.freeRemaining} · {result.provider} · {result.model} · {result.latencyMs}ms</>
                )}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
