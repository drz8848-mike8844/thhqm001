import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createSupabaseServerClient,
  getCurrentProfile,
} from "@/lib/supabase/server";
import { listPosts, toCard } from "@/lib/posts";
import { PostCard } from "@/components/PostCard";
import { FollowButton } from "@/components/FollowButton";
import { MessageButton } from "@/components/MessageButton";
import { displayName, initialOf, levelProgress, compactNumber } from "@/lib/format";

type ProfileRow = {
  id: string;
  username: string;
  nickname: string | null;
  bio: string | null;
  avatar_url: string | null;
  level: number;
  xp: number;
  bonus_xp: number;
  role: "user" | "mod" | "owner";
  posts_count: number;
  likes_received: number;
  comments_count: number;
  followers_count: number;
  following_count: number;
  created_at: string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)}` };
}

export default async function UserPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("profiles")
    .select(
      "id, username, nickname, bio, avatar_url, level, xp, bonus_xp, role, posts_count, likes_received, comments_count, followers_count, following_count, created_at",
    )
    .eq("username", decodeURIComponent(username))
    .maybeSingle();

  const profile = data as ProfileRow | null;
  if (!profile) notFound();

  const viewer = await getCurrentProfile();
  const isSelf = viewer?.id === profile.id;

  const [{ posts, count }, followResult] = await Promise.all([
    listPosts(supabase, { authorId: profile.id, limit: 10 }),
    viewer
      ? supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", viewer.id)
          .eq("following_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const name = displayName(profile);
  const progress = levelProgress(profile.xp, profile.level);
  const roleLabel =
    profile.role === "owner" ? "站长" : profile.role === "mod" ? "管理员" : null;

  return (
    <div className="profile-page">
      <header className="panel profile-hero">
        <div className="profile-hero__main">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="avatar avatar--xxl"
              src={profile.avatar_url}
              alt=""
              width={88}
              height={88}
            />
          ) : (
            <span className="avatar avatar--xxl" aria-hidden="true">
              {initialOf(name)}
            </span>
          )}

          <div className="profile-hero__id">
            <h1>{name}</h1>
            <p className="muted">
              @{profile.username}
              {roleLabel && <span className="badge badge--accent">{roleLabel}</span>}
              <span className="badge">Lv.{profile.level}</span>
            </p>
            {profile.bio && <p className="profile-hero__bio">{profile.bio}</p>}
          </div>
        </div>

        <div className="profile-hero__aside">
          <FollowButton
            targetId={profile.id}
            initialFollowing={Boolean(followResult.data)}
            initialFollowers={profile.followers_count}
            signedIn={Boolean(viewer)}
            isSelf={isSelf}
          />
          <MessageButton
            targetId={profile.id}
            signedIn={Boolean(viewer)}
            isSelf={isSelf}
          />
        </div>
      </header>

      <div className="profile-stats panel panel__pad">
        <dl>
          <div>
            <dt>创作</dt>
            <dd>{compactNumber(profile.posts_count)}</dd>
          </div>
          <div>
            <dt>获赞</dt>
            <dd>{compactNumber(profile.likes_received)}</dd>
          </div>
          <div>
            <dt>评论</dt>
            <dd>{compactNumber(profile.comments_count)}</dd>
          </div>
          <div>
            <dt>关注者</dt>
            <dd>{compactNumber(profile.followers_count)}</dd>
          </div>
          <div>
            <dt>正在关注</dt>
            <dd>{compactNumber(profile.following_count)}</dd>
          </div>
        </dl>

        <div className="level-bar" aria-label={`等级 ${profile.level}，经验 ${profile.xp}`}>
          <div className="level-bar__track">
            <span style={{ inlineSize: `${progress.percent}%` }} />
          </div>
          <p className="muted">
            {profile.level >= 10
              ? "已达最高等级"
              : `${profile.xp} / ${progress.ceil} XP · 距 Lv.${profile.level + 1} 还差 ${Math.max(
                  progress.ceil - profile.xp,
                  0,
                )}`}
          </p>
        </div>
      </div>

      <section aria-labelledby="user-posts">
        <div className="section-head">
          <h2 id="user-posts">{isSelf ? "我的创作" : "TA 的创作"}</h2>
          <span className="section-head__meta">{compactNumber(count)} 篇</span>
          {isSelf && (
            <Link className="section-head__more" href="/posts/new">
              + 写一篇
            </Link>
          )}
        </div>

        {posts.length === 0 ? (
          <p className="empty">还没有发布过创作。</p>
        ) : (
          <div className="post-grid">
            {posts.map((post) => (
              <PostCard key={post.id} post={toCard(post)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
