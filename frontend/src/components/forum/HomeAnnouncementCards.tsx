import type { AnnouncementLevel, ServerAnnouncement } from "@/lib/api/announcements";

const LEVEL_ACCENT: Record<AnnouncementLevel, string> = {
  info: "border-l-blue-500",
  success: "border-l-emerald-500",
  warning: "border-l-amber-500",
  danger: "border-l-rose-500",
};

// HomeAnnouncementCards renders home_card-placement announcements as a
// stack of accent-bordered cards above the sort tabs. Server-rendered —
// dismissal for home cards is intentionally NOT offered because home cards
// are longer-lived content pieces (recruitment, feature drops) where the
// admin controls visibility via start/end dates, not per-user dismiss.
export function HomeAnnouncementCards({ items }: { items: ServerAnnouncement[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {items.map((a) => (
        <article
          key={a.id}
          className={`rounded-lg border border-border bg-card p-4 border-l-4 ${LEVEL_ACCENT[a.level]}`}
        >
          <h3 className="mb-1 text-sm font-semibold text-foreground">{a.title}</h3>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{a.content}</p>
        </article>
      ))}
    </div>
  );
}
