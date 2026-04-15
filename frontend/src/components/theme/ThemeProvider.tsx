"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { AccentProvider } from "./AccentProvider";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AccentProvider>{children}</AccentProvider>
    </NextThemesProvider>
  );
}
