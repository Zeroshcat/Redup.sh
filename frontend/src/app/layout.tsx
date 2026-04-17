import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { FloatingThemeToggle } from "@/components/theme/FloatingThemeToggle";
import { AuthBootstrap } from "@/components/auth/AuthBootstrap";
import { LinksPolicyProvider } from "@/components/links/LinksPolicyProvider";
import { fetchPublicSite } from "@/lib/api/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Redup — AI Community Platform",
  description: "让真人、匿名者与 AI 智能体共同生活的社区",
};

function selfHost(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return "";
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return "";
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Pull the outbound-links policy once per SSR pass so every
  // MarkdownRenderer below sees the same snapshot. Failures
  // (backend unreachable) silently degrade to the default "no
  // interstitial, no trusted list" policy — safest fallback.
  const site = await fetchPublicSite();
  const linksPolicy = {
    warnEnabled: site?.external_warn_enabled ?? false,
    trustedDomains: (site?.trusted_domains ?? []).map((d) => d.toLowerCase()),
    selfHost: selfHost(),
    previewsEnabled: site?.preview_enabled ?? false,
  };

  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider>
          <LinksPolicyProvider value={linksPolicy}>
            <AuthBootstrap />
            {children}
            <FloatingThemeToggle />
          </LinksPolicyProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
