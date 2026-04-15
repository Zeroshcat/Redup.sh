"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { ACCENTS, useAccent, type AccentKey } from "./AccentProvider";

const MODES = [
  { key: "light", label: "浅色", icon: "☀" },
  { key: "dark", label: "深色", icon: "☾" },
  { key: "system", label: "跟随系统", icon: "⚙" },
] as const;

const HUE_STOPS = Array.from({ length: 13 }, (_, i) => {
  const h = (i * 360) / 12;
  return `oklch(0.58 0.2 ${h}) ${(i / 12) * 100}%`;
}).join(", ");
const HUE_GRADIENT = `linear-gradient(to right, ${HUE_STOPS})`;

export function FloatingThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { accent, setPreset, setCustomHue, previewCssForHue } = useAccent();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"preset" | "custom">(
    accent.type === "custom" ? "custom" : "preset",
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const isDark = mounted && resolvedTheme === "dark";
  const currentHue = accent.type === "custom" ? accent.hue : 260;

  return (
    <div ref={ref} className="fixed bottom-4 left-4 z-40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="外观设置"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-base text-muted-foreground shadow-md transition hover:text-foreground"
      >
        {mounted ? (isDark ? "☾" : "☀") : "☀"}
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 z-50 w-72 rounded-lg border border-border bg-popover p-3 shadow-xl">
          <div className="mb-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              外观
            </div>
            <div className="grid grid-cols-3 gap-1">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setTheme(m.key)}
                  className={`flex flex-col items-center gap-1 rounded-md border py-2 text-[11px] transition ${
                    theme === m.key
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <span className="text-base leading-none">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                主色
              </div>
              <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setTab("preset")}
                  className={`rounded px-2 py-0.5 ${
                    tab === "preset"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  预设
                </button>
                <button
                  type="button"
                  onClick={() => setTab("custom")}
                  className={`rounded px-2 py-0.5 ${
                    tab === "custom"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  自定义
                </button>
              </div>
            </div>

            {tab === "preset" ? (
              <div className="grid grid-cols-3 gap-1.5">
                {(Object.keys(ACCENTS) as AccentKey[]).map((key) => {
                  const config = ACCENTS[key];
                  const active = accent.type === "preset" && accent.key === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPreset(key)}
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition ${
                        active
                          ? "border-primary bg-accent text-foreground"
                          : "border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-full ${config.swatch}`} />
                      {config.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={1}
                    value={currentHue}
                    onChange={(e) => setCustomHue(Number(e.target.value))}
                    className="hue-slider h-3 w-full cursor-pointer appearance-none rounded-full"
                    style={{ background: HUE_GRADIENT }}
                  />
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>0°</span>
                    <span className="font-mono">{currentHue}°</span>
                    <span>360°</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2">
                  <div
                    className="h-5 w-5 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: previewCssForHue(currentHue) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-foreground">预览</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      oklch(0.58 0.2 {currentHue})
                    </div>
                  </div>
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-[11px] font-medium"
                    style={{
                      backgroundColor: previewCssForHue(currentHue),
                      color: "oklch(0.985 0 0)",
                    }}
                  >
                    按钮
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .hue-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: white;
          border: 2px solid rgba(0, 0, 0, 0.3);
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }
        .hue-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          background: white;
          border: 2px solid rgba(0, 0, 0, 0.3);
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  );
}
