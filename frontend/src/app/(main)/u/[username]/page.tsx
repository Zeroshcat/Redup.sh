import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthorAvatar } from "@/components/forum/AuthorAvatar";
import { ReportButton } from "@/components/forum/ReportButton";
import { FollowButton, FollowCounts } from "@/components/user/FollowButton";
import { UserProfileTabs } from "@/components/user/UserProfileTabs";
import { WalletWidget } from "@/components/user/WalletWidget";
import {
  fetchPublicUser,
  fetchUserPosts,
  fetchUserTopics,
} from "@/lib/api/users";
import type { User } from "@/types";

function formatJoinDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await fetchPublicUser(username);

  if (!profile) notFound();

  const [topics, replies] = await Promise.all([
    fetchUserTopics(profile.username),
    fetchUserPosts(profile.username),
  ]);

  const user: User = {
    id: profile.id,
    username: profile.username,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
    location: profile.location,
    website: profile.website,
    level: profile.level,
    joinedAt: profile.joined_at,
    creditScore: profile.credit_score,
  };

  const stats = {
    topics: topics.length,
    replies: replies.length,
    likes: topics.reduce((sum, t) => sum + t.likeCount, 0),
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          首页
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-foreground">@{user.username}</span>
      </nav>

      <section className="mb-8 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <AuthorAvatar author={{ type: "user", user }} size={88} />

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{user.username}</h1>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
                L{user.level}
              </span>
              {profile.role === "admin" && (
                <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                  管理员
                </span>
              )}
              <span className="font-mono text-xs text-muted-foreground">
                @{user.username}
              </span>
            </div>

            {user.bio && (
              <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{user.bio}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>📅 {formatJoinDate(user.joinedAt)} 加入</span>
              {user.location && <span>📍 {user.location}</span>}
              {user.website && (
                <a
                  href={user.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                >
                  🔗 {user.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {typeof user.creditScore === "number" && (
                <span>
                  ⭐ 信用分 <span className="font-mono text-foreground">{user.creditScore}</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <FollowButton targetUserId={user.id} targetUsername={user.username} />
              <Link
                href={`/messages/${user.id}`}
                className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                💬 私信
              </Link>
            </div>
            <FollowCounts targetUserId={user.id} />
            <div className="text-xs text-muted-foreground">
              <ReportButton
                targetType="user"
                targetId={user.id}
                targetTitle={`@${user.username}`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="发帖" value={stats.topics} />
        <StatCard label="回复" value={stats.replies} />
        <StatCard label="获赞" value={stats.likes} />
      </section>

      <section className="mb-6">
        <WalletWidget
          ownerUsername={user.username}
          publicLevel={profile.level}
          publicXP={profile.xp ?? 0}
        />
      </section>

      <section>
        <UserProfileTabs topics={topics} replies={replies} bots={[]} />
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-2xl font-bold text-foreground">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
