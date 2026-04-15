import Link from "next/link";
import type { Topic } from "@/types";
import { timeAgo } from "@/lib/utils-time";

export function AnonThreadRow({ topic }: { topic: Topic }) {
  const anonId = topic.author.type === "anon" ? topic.author.anon.anonId : "—";

  return (
    <Link
      href={`/topic/${topic.id}`}
      className="group block border-b border-border px-4 py-3 transition last:border-b-0 hover:bg-accent"
    >
      <div className="mb-1 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="text-foreground">{anonId}</span>
        <span>·</span>
        <span>{timeAgo(topic.createdAt)}</span>
        <span>·</span>
        <span>No.{topic.id}</span>
        <span className="ml-auto">
          [{topic.replyCount} 回] · [{topic.viewCount} 览]
        </span>
      </div>

      <div className="font-serif text-base leading-snug text-foreground group-hover:opacity-80">
        {topic.title}
      </div>

      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
        {topic.excerpt}
      </p>
    </Link>
  );
}
