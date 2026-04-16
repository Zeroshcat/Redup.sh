import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorAvatar, authorDisplayName } from "@/components/forum/AuthorAvatar";
import { ReplyItem } from "@/components/forum/ReplyItem";
import { ReplyButton } from "@/components/forum/ReplyButton";
import { ReplyComposer } from "@/components/forum/ReplyComposer";
import { TopicContentGuard } from "@/components/forum/TopicContentGuard";
import { TopicStateHydrator } from "@/components/forum/TopicStateHydrator";
import { TopicTimeline } from "@/components/forum/TopicTimeline";
import { LikeButton } from "@/components/forum/LikeButton";
import { BookmarkButton } from "@/components/forum/BookmarkButton";
import { AdminPinWeightBadge } from "@/components/forum/AdminPinWeightBadge";
import { PinBadge } from "@/components/forum/PinBadge";
import { ReportButton } from "@/components/forum/ReportButton";
import { SummonBotButton } from "@/components/forum/SummonBotButton";
import { TopicAdminBar } from "@/components/forum/TopicAdminBar";
import { EditableBody } from "@/components/forum/EditableBody";
import { fetchTopicDetail } from "@/lib/api/forum-server";
import { timeAgo } from "@/lib/utils-time";

export default async function TopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId) || numId <= 0 || !Number.isInteger(numId)) {
    notFound();
  }
  const detail = await fetchTopicDetail(numId);

  if (!detail) notFound();

  const { topic, posts } = detail;
  const isAnonCategory = topic.categorySlug.startsWith("anon");
  const isAnon = topic.author.type === "anon";
  const isBot = topic.author.type === "bot";
  const authorName = authorDisplayName(topic.author);
  const totalFloors = 1 + posts.length;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 gap-8 px-4 py-8">
      <TopicStateHydrator topicId={topic.id} />
      <section className="min-w-0 flex-1">
        <nav className="mb-4 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">首页</Link>
          <span className="mx-1.5">›</span>
          <Link href={`/${topic.categorySlug}`} className="hover:text-foreground">
            {topic.categoryName ?? topic.categorySlug}
          </Link>
        </nav>

        <header className="mb-6">
          <h1 className="mb-3 text-[26px] font-bold leading-tight text-foreground">
            {topic.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <PinBadge level={topic.pinLevel} />
            <AdminPinWeightBadge level={topic.pinLevel} weight={topic.pinWeight} />
            {topic.isFeatured && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                精华
              </span>
            )}
            <Link
              href={`/${topic.categorySlug}`}
              className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground hover:bg-accent"
            >
              {topic.categoryName ?? topic.categorySlug}
            </Link>
            {topic.tags?.map((t) => (
              <span key={t} className="text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        </header>

        <div className="divide-y divide-border">
          <article
            id="floor-1"
            className={`flex scroll-mt-20 gap-4 py-6 ${isBot ? "bg-violet-500/5" : ""}`}
          >
            <div className="shrink-0">
              {topic.author.type === "user" ? (
                <Link href={`/u/${topic.author.user.username}`}>
                  <AuthorAvatar author={topic.author} size={44} />
                </Link>
              ) : topic.author.type === "bot" ? (
                <Link href={`/bot/${topic.author.bot.slug}`}>
                  <AuthorAvatar author={topic.author} size={44} />
                </Link>
              ) : (
                <AuthorAvatar author={topic.author} size={44} />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center gap-2 text-xs">
                {topic.author.type === "user" ? (
                  <Link
                    href={`/u/${topic.author.user.username}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {authorName}
                  </Link>
                ) : topic.author.type === "bot" ? (
                  <Link
                    href={`/bot/${topic.author.bot.slug}`}
                    className="font-medium text-violet-600 hover:underline dark:text-violet-400"
                  >
                    {authorName}
                  </Link>
                ) : (
                  <span className="font-mono font-medium text-muted-foreground">{authorName}</span>
                )}
                {isBot && (
                  <span className="rounded bg-violet-500/15 px-1 text-[10px] text-violet-600 dark:text-violet-400">BOT</span>
                )}
                {topic.author.type === "user" && (
                  <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                    L{topic.author.user.level}
                  </span>
                )}
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{timeAgo(topic.createdAt)}</span>
                {topic.editedAt && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span
                      className="text-muted-foreground/80"
                      title={new Date(topic.editedAt).toLocaleString()}
                    >
                      已编辑 {timeAgo(topic.editedAt)}
                    </span>
                  </>
                )}
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">#1</span>
              </div>

              {topic.author.type === "user" && topic.author.user.isBanned ? (
                <div className="rounded-md border border-dashed border-rose-500/30 bg-rose-500/5 px-3 py-3 text-xs text-rose-600 dark:text-rose-400">
                  🚫 此用户已被封禁，内容已隐藏
                </div>
              ) : (
                <TopicContentGuard
                  minReadLevel={topic.minReadLevel ?? 0}
                  authorId={topic.author.type === "user" ? topic.author.user.id : undefined}
                >
                  <EditableBody
                    target={{ kind: "topic", id: topic.id }}
                    content={topic.body ?? topic.excerpt}
                    ownerUserId={topic.author.type === "user" ? topic.author.user.id : undefined}
                    authorType={topic.author.type}
                  />
                </TopicContentGuard>
              )}

              <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                <LikeButton
                  target="topic"
                  id={topic.id}
                  initialLiked={topic.userLiked}
                  initialCount={topic.likeCount}
                />
                <ReplyButton />
                <BookmarkButton topicId={topic.id} initialBookmarked={topic.userBookmarked} />
                <button className="inline-flex items-center gap-1 hover:text-foreground">🔗 分享</button>
                <SummonBotButton topicId={topic.id} />
                <ReportButton targetType="topic" targetId={topic.id} targetTitle={topic.title} />
                <TopicAdminBar
                  topicId={topic.id}
                  initialPinLevel={topic.pinLevel ?? 0}
                  initialPinWeight={topic.pinWeight ?? 0}
                  initialLocked={topic.isLocked ?? false}
                  initialFeatured={topic.isFeatured ?? false}
                />
              </div>
            </div>
          </article>

          <TopicContentGuard
            minReadLevel={topic.minReadLevel ?? 0}
            authorId={topic.author.type === "user" ? topic.author.user.id : undefined}
          >
            {posts.map((p) => (
              <ReplyItem key={p.id} post={p} topicTitle={topic.title} />
            ))}
          </TopicContentGuard>
        </div>

        <div className="mt-8">
          {topic.isLocked ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-center text-sm text-muted-foreground">
              🔒 本帖已锁定，无法回复
            </div>
          ) : (
            <ReplyComposer topicId={topic.id} isAnonCategory={isAnonCategory} />
          )}
        </div>
      </section>

      <aside className="hidden w-40 shrink-0 lg:block">
        <TopicTimeline
          totalFloors={totalFloors}
          createdAt={topic.createdAt}
          lastPostAt={topic.lastPostAt}
        />
      </aside>
    </main>
  );
}
