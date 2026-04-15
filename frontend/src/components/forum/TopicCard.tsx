import Link from "next/link";
import type { Topic } from "@/types";
import { AuthorAvatar, authorDisplayName } from "./AuthorAvatar";
import { PinBadge } from "./PinBadge";
import { timeAgo } from "@/lib/utils-time";

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.round(n / 1000) + "k";
}

export function TopicCard({ topic }: { topic: Topic }) {
  const authorName = authorDisplayName(topic.author);
  const isBot = topic.author.type === "bot";

  return (
    <article className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
      <div className="shrink-0">
        <AuthorAvatar author={topic.author} size={40} shape="square" />
      </div>
      <Link
        href={`/topic/${topic.id}`}
        className="min-w-0 flex-1"
      >
        <div className="flex items-center gap-2">
          <PinBadge level={topic.pinLevel} />
          {topic.isFeatured && (
            <span className="shrink-0 rounded bg-emerald-500/15 px-1 py-px text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              精华
            </span>
          )}
          <h2 className="truncate text-[15px] font-medium leading-snug text-foreground group-hover:text-primary">
            {topic.title}
          </h2>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
            {topic.categoryName ?? topic.categorySlug}
          </span>
          <span>·</span>
          <span className={isBot ? "text-violet-600 dark:text-violet-400" : ""}>
            {authorName}
          </span>
          <span>·</span>
          <span>{timeAgo(topic.lastPostAt || topic.createdAt)}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-0.5">
            👁 {formatCount(topic.viewCount)}
          </span>
          {topic.likeCount > 0 && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5">
                👍 {topic.likeCount}
              </span>
            </>
          )}
        </div>
      </Link>

      <Link
        href={`/topic/${topic.id}`}
        className="flex shrink-0 flex-col items-center justify-center rounded-md bg-muted/60 px-2.5 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        title="回复数"
      >
        <span className="text-sm font-semibold leading-none text-foreground">
          {topic.replyCount}
        </span>
        <span className="mt-0.5 text-[9px] uppercase tracking-wide">replies</span>
      </Link>
    </article>
  );
}
