import Link from "next/link";
import type { Post } from "@/types";
import { AuthorAvatar, authorDisplayName } from "./AuthorAvatar";
import { LikeButton } from "./LikeButton";
import { ReportButton } from "./ReportButton";
import { TranslatableContent } from "@/components/markdown/TranslatableContent";
import { timeAgo } from "@/lib/utils-time";

export function ReplyItem({ post, topicTitle }: { post: Post; topicTitle?: string }) {
  const isBot = post.author.type === "bot";
  const isAnon = post.author.type === "anon";
  const name = authorDisplayName(post.author);
  const authorHref =
    post.author.type === "user"
      ? `/u/${post.author.user.username}`
      : post.author.type === "bot"
      ? `/bot/${post.author.bot.slug}`
      : null;

  const nameClass = `font-medium ${
    isBot
      ? "text-violet-600 dark:text-violet-400"
      : isAnon
      ? "font-mono text-muted-foreground"
      : "text-foreground"
  }`;

  return (
    <article
      id={`floor-${post.floor}`}
      className={`flex gap-4 py-6 ${isBot ? "bg-violet-500/5" : ""}`}
    >
      <div className="shrink-0">
        {authorHref ? (
          <Link href={authorHref}>
            <AuthorAvatar author={post.author} size={44} />
          </Link>
        ) : (
          <AuthorAvatar author={post.author} size={44} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2 text-xs">
          {authorHref ? (
            <Link href={authorHref} className={`${nameClass} hover:underline`}>
              {name}
            </Link>
          ) : (
            <span className={nameClass}>{name}</span>
          )}
          {isBot && (
            <span className="rounded bg-violet-500/15 px-1 text-[10px] text-violet-600 dark:text-violet-400">BOT</span>
          )}
          {post.author.type === "user" && (
            <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
              L{post.author.user.level}
            </span>
          )}
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{timeAgo(post.createdAt)}</span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">#{post.floor}</span>
        </div>

        {post.replyTo && (
          <div className="mb-2 rounded border-l-2 border-border bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
            回复 <span className="font-medium">#{post.replyTo.floor} {post.replyTo.authorName}</span>
          </div>
        )}

        {post.author.type === "user" && post.author.user.isBanned ? (
          <div className="rounded-md border border-dashed border-rose-500/30 bg-rose-500/5 px-3 py-3 text-xs text-rose-600 dark:text-rose-400">
            🚫 此用户已被封禁，内容已隐藏
          </div>
        ) : (
          <TranslatableContent content={post.content} />
        )}

        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <LikeButton
            target="post"
            id={post.id}
            initialLiked={post.userLiked}
            initialCount={post.likeCount}
          />
          <button className="inline-flex items-center gap-1 hover:text-foreground">💬 回复</button>
          <ReportButton
            targetType="post"
            targetId={post.id}
            targetTitle={
              topicTitle ? `${topicTitle} #${post.floor}` : `回帖 #${post.floor}`
            }
          />
        </div>
      </div>
    </article>
  );
}
