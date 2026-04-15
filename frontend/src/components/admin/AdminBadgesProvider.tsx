"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getReportCounts, type ServerReport } from "@/lib/api/reports";
import { adminGetModerationCounts, type Verdict } from "@/lib/api/moderation";
import { useStream, type ConnectionStatus } from "@/lib/stream";

// Live counters for the admin sidebar. Seeded from the same REST endpoints
// the /admin/reports and /admin/moderation pages use, then kept in sync via
// SSE events (report.created / report.resolved / moderation.warn /
// moderation.block). A single subscription is mounted at the layout level so
// we don't open one EventSource per page.
interface AdminBadges {
  reportsPending: number;
  // "Pending" for moderation means unresolved warn+block rows — the number
  // the admin would still need to action. Close approximation: warn + block
  // in the aggregate counts endpoint.
  moderationPending: number;
  // Bot webhook failures that have arrived over SSE since the admin last
  // visited /admin/bot-logs. Intentionally session-scoped rather than a
  // persistent queue: once you've seen the page the badge clears, and the
  // historical count is visible on the bot-logs page itself.
  botFailuresNew: number;
  // SSE liveness. When not "open", badges may be stale and pages that
  // depend on live sync should warn the user.
  streamStatus: ConnectionStatus;
}

const AdminBadgesContext = createContext<AdminBadges>({
  reportsPending: 0,
  moderationPending: 0,
  botFailuresNew: 0,
  streamStatus: "idle",
});

export function useAdminBadges() {
  return useContext(AdminBadgesContext);
}

export function AdminBadgesProvider({ children }: { children: React.ReactNode }) {
  const [reportsPending, setReportsPending] = useState(0);
  const [moderationPending, setModerationPending] = useState(0);
  const [botFailuresNew, setBotFailuresNew] = useState(0);
  const pathname = usePathname();

  // Clear the bot failure badge whenever the admin lands on /admin/bot-logs.
  // "They've seen the problem, don't keep pestering them on every nav."
  // This is a legitimate URL-→-state sync, which is exactly the case the
  // set-state-in-effect rule is designed to flag but not a mistake here.
  useEffect(() => {
    if (pathname === "/admin/bot-logs" || pathname?.startsWith("/admin/bot-logs/")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- URL-driven counter reset
      setBotFailuresNew(0);
    }
  }, [pathname]);

  const bumpBotFailure = useCallback(() => setBotFailuresNew((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getReportCounts(), adminGetModerationCounts()])
      .then(([rc, mc]) => {
        if (cancelled) return;
        setReportsPending(rc.pending ?? 0);
        const mod = mc as Record<Verdict, number>;
        setModerationPending((mod.warn ?? 0) + (mod.block ?? 0));
      })
      .catch(() => {
        // Silent — badges are a nice-to-have, not critical. The page's own
        // fetch will surface any real error.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlers = useMemo(
    () => ({
      "report.created": (d: unknown) => {
        const r = d as ServerReport;
        if (r.status === "pending") setReportsPending((n) => n + 1);
      },
      "report.resolved": (d: unknown) => {
        const r = d as ServerReport;
        // Both resolve and dismiss drop the row out of the pending bucket.
        if (r.status !== "pending") setReportsPending((n) => Math.max(0, n - 1));
      },
      "moderation.warn": () => setModerationPending((n) => n + 1),
      "moderation.block": () => setModerationPending((n) => n + 1),
      "bot.call.failed": () => bumpBotFailure(),
    }),
    [bumpBotFailure],
  );
  const streamStatus = useStream(handlers);

  // After a reconnect, counts may have drifted while we were offline (events
  // that happened during the gap were dropped by the hub, which has no
  // replay buffer). Re-seed from REST whenever we come back online.
  const hasBeenOpenRef = useRef(false);
  useEffect(() => {
    if (streamStatus !== "open") return;
    if (!hasBeenOpenRef.current) {
      hasBeenOpenRef.current = true;
      return; // first "open" — initial mount fetch already ran
    }
    let cancelled = false;
    Promise.all([getReportCounts(), adminGetModerationCounts()])
      .then(([rc, mc]) => {
        if (cancelled) return;
        setReportsPending(rc.pending ?? 0);
        const mod = mc as Record<Verdict, number>;
        setModerationPending((mod.warn ?? 0) + (mod.block ?? 0));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [streamStatus]);

  const value = useMemo(
    () => ({ reportsPending, moderationPending, botFailuresNew, streamStatus }),
    [reportsPending, moderationPending, botFailuresNew, streamStatus],
  );

  return <AdminBadgesContext.Provider value={value}>{children}</AdminBadgesContext.Provider>;
}
