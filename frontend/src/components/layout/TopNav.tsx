import Link from "next/link";
import { MessageBell } from "@/components/layout/MessageBell";
import { NotificationBell } from "@/components/notification/NotificationBell";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { UserMenu } from "@/components/layout/UserMenu";
import { TopBanner } from "@/components/layout/TopBanner";
import { fetchActiveAnnouncements } from "@/lib/api/announcements";
import { fetchPublicSite } from "@/lib/api/site";

export async function TopNav() {
  const [siteInfoResult, bannersResult] = await Promise.allSettled([
    fetchPublicSite(),
    fetchActiveAnnouncements("top_banner"),
  ]);
  const siteInfo = siteInfoResult.status === "fulfilled" ? siteInfoResult.value : null;
  const banners = bannersResult.status === "fulfilled" ? bannersResult.value : [];
  const siteName = siteInfo?.name ?? "Redup";
  const initial = siteName[0]?.toUpperCase() ?? "R";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur">
      <TopBanner items={banners} />
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
            {initial}
          </div>
          <span className="font-semibold tracking-tight">{siteName}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link href="/" className="rounded-md px-3 py-1.5 text-sm text-foreground hover:bg-accent">
            首页
          </Link>
          <Link href="/feed" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent">
            关注
          </Link>
          <Link href="/anon" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent">
            匿名区
          </Link>
          <Link href="/bot" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent">
            Bot 区
          </Link>
        </nav>

        <div className="flex-1" />

        <GlobalSearch />

        <div className="flex items-center gap-2">
          <MessageBell />
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
