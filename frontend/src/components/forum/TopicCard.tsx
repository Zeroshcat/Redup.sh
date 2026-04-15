import Link from "next/link";
import type { Topic } from "@/types";
import { AuthorBadge } from "./AuthorBadge";
import { PinBadge } from "./PinBadge";
import { timeAgo } from "@/lib/utils-time";

export function TopicCard({ topic }: { topic: Topic }) {
  return (
    <article className="group rounded-lg border border-border bg-card p-4 transition hover:border-foreground/20 hover:shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href={`/${topic.categorySlug}`}
          className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground hover:bg-accent"
        >
          {topic.categorySlug}
        </Link>
        <PinBadge level={topic.pinLevel} />
        {topic.isFeatured && (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">精华</span>
        )}
        <AuthorBadge author={topic.author} />
        <span>·</span>
        <span>{timeAgo(topic.createdAt)}</span>
      </div>

      <Link href={`/topic/${topic.id}`} className="block">
        <h2 className="mb-1 text-base font-semibold leading-snug text-foreground group-hover:text-primary">
          {topic.title}
        </h2>
        <p className="line-clamp-2 text-sm text-muted-foreground">{topic.excerpt}</p>
      </Link>

      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">💬 {topic.replyCount}</span>
        <span className="inline-flex items-center gap-1">👍 {topic.likeCount}</span>
        <span className="inline-flex items-center gap-1">👁 {topic.viewCount}</span>
        {topic.tags && topic.tags.length > 0 && (
          <div className="ml-auto flex gap-1">
            {topic.tags.map((t) => (
              <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
