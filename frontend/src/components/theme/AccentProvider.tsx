"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type AccentKey = "zinc" | "violet" | "blue" | "emerald" | "rose" | "amber";

interface OklchScheme {
  primary: string;
  primaryForeground: string;
  ring: string;
}

export const ACCENTS: Record<
  AccentKey,
  {
    label: string;
    light: OklchScheme;
    dark: OklchScheme;
    swatch: string;
  }
> = {
  zinc: {
    label: "石墨",
    light: { primary: "0.205 0 0", primaryForeground: "0.985 0 0", ring: "0.708 0 0" },
    dark: { primary: "0.922 0 0", primaryForeground: "0.205 0 0", ring: "0.556 0 0" },
    swatch: "bg-zinc-800",
  },
  violet: {
    label: "紫罗兰",
    light: { primary: "0.54 0.22 295", primaryForeground: "0.985 0 0", ring: "0.62 0.2 295" },
    dark: { primary: "0.65 0.22 295", primaryForeground: "0.145 0 0", ring: "0.7 0.2 295" },
    swatch: "bg-violet-600",
  },
  blue: {
    label: "海蓝",
    light: { primary: "0.52 0.19 255", primaryForeground: "0.985 0 0", ring: "0.6 0.18 255" },
    dark: { primary: "0.65 0.2 255", primaryForeground: "0.145 0 0", ring: "0.72 0.18 255" },
    swatch: "bg-blue-600",
  },
  emerald: {
    label: "翡翠",
    light: { primary: "0.55 0.16 160", primaryForeground: "0.985 0 0", ring: "0.62 0.15 160" },
    dark: { primary: "0.68 0.17 160", primaryForeground: "0.145 0 0", ring: "0.74 0.15 160" },
    swatch: "bg-emerald-600",
  },
  rose: {
    label: "玫瑰",
    light: { primary: "0.58 0.2 20", primaryForeground: "0.985 0 0", ring: "0.65 0.19 20" },
    dark: { primary: "0.7 0.2 20", primaryForeground: "0.145 0 0", ring: "0.76 0.18 20" },
    swatch: "bg-rose-600",
  },
  amber: {
    label: "琥珀",
    light: { primary: "0.72 0.17 65", primaryForeground: "0.145 0 0", ring: "0.78 0.15 65" },
    dark: { primary: "0.8 0.17 65", primaryForeground: "0.145 0 0", ring: "0.84 0.15 65" },
    swatch: "bg-amber-500",
  },
};

// For a given hue, derive OKLCH schemes optimized for light and dark surfaces.
// L/C kept fixed so user never lands in bad-contrast territory.
function schemeFromHue(hue: number): { light: OklchScheme; dark: OklchScheme } {
  return {
    light: {
      primary: `0.54 0.2 ${hue}`,
      primaryForeground: "0.985 0 0",
      ring: `0.62 0.2 ${hue}`,
    },
    dark: {
      primary: `0.68 0.2 ${hue}`,
      primaryForeground: "0.145 0 0",
      ring: `0.74 0.2 ${hue}`,
    },
  };
}

export type AccentState =
  | { type: "preset"; key: AccentKey }
  | { type: "custom"; hue: number };

interface AccentContextValue {
  accent: AccentState;
  setPreset: (key: AccentKey) => void;
  setCustomHue: (hue: number) => void;
  previewCssForHue: (hue: number) => string;
}

const AccentContext = createContext<AccentContextValue | null>(null);

const STORAGE_KEY = "redup-accent-v2";

function applyAccent(accent: AccentState) {
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const scheme =
    accent.type === "preset"
      ? isDark
        ? ACCENTS[accent.key].dark
        : ACCENTS[accent.key].light
      : (() => {
          const s = schemeFromHue(accent.hue);
          return isDark ? s.dark : s.light;
        })();
  root.style.setProperty("--primary", `oklch(${scheme.primary})`);
  root.style.setProperty("--primary-foreground", `oklch(${scheme.primaryForeground})`);
  root.style.setProperty("--ring", `oklch(${scheme.ring})`);
}

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentState>({ type: "preset", key: "zinc" });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AccentState;
        if (parsed.type === "preset" && parsed.key in ACCENTS) {
          setAccentState(parsed);
        } else if (parsed.type === "custom" && typeof parsed.hue === "number") {
          setAccentState(parsed);
        }
      }
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyAccent(accent);

    const observer = new MutationObserver(() => applyAccent(accent));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, [accent, mounted]);

  function persist(next: AccentState) {
    setAccentState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function setPreset(key: AccentKey) {
    persist({ type: "preset", key });
  }

  function setCustomHue(hue: number) {
    persist({ type: "custom", hue });
  }

  function previewCssForHue(hue: number) {
    return `oklch(0.58 0.2 ${hue})`;
  }

  return (
    <AccentContext.Provider value={{ accent, setPreset, setCustomHue, previewCssForHue }}>
      {children}
    </AccentContext.Provider>
  );
}

export function useAccent() {
  const ctx = useContext(AccentContext);
  if (!ctx) throw new Error("useAccent must be used inside AccentProvider");
  return ctx;
}
