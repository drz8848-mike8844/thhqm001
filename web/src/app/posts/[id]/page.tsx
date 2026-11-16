import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { createSupabaseServerClient, getCurrentProfile } from "@/lib/supabase/server";
import { PostBody } from "@/components/PostBody";
import { PostActions } from "@/components/PostActions";
import { ReportButton } from "@/components/ReportButton";
import { CommentSection, type CommentItem } from "@/components/CommentSection";
import {
  absoluteTime,
  compactNumber,
  displayName,
  initialOf,
  relativeTime,
} from "@/lib/format";

type PostRow = {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  views_count: number;
  likes_count: number;
  favorites_count: number;
  comments_count: number;
  is_pinned: boolean;
  is_essence: boolean;
  author_id: string;
  author: {
    id: string;
    username: string;
    nickname: string | null;
    avatar_url: string | null;
    bio: string | null;
    level: number;
    xp: number;
    role: "user" | "mod" | "owner";
    posts_count: number;
    followers_count: number;
  } | null;
  post_tags: { tags: { name: string } | null }[] | null;
  post_images: { url: string; sort_order: number }[] | null;
};

const POST_DETAIL_SELECT = `
  id, title, content, created_at, updated_at, views_count, likes_count,
  favorites_count, comments_count, is_pinned, is_essence, author_id,
  author:profiles!posts_author_id_fkey (
    id, username, nickname, avatar_url, bio, level, xp, role, posts_count, followers_count
  ),
  post_tags (tags (name)),
  post_images (url, sort_order)
`;

async function fetchPost(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POST_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (error.code !== "PGRST116") console.error("[post]", error.message);
    return null;
  }
  return (data as unknown as PostRow) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await fetchPost(id);
  if (!post) return { title: "帖子不存在" };
  return {
    title: post.title,
    description: post.content.slice(0, 140),
  };
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await fetchPost(id);
  if (!post) notFound();

  const supabase = await createSupabaseServerClient();
  const profile = await getCurrentProfile();
  const isStaff = profile?.role === "mod" || profile?.role === "owner";
  const isOwner = profile?.id === post.author_id;

  const [likedResult, favoritedResult, commentsResult] =
    await Promise.all([
      profile
        ? supabase
            .from("post_likes")
            .select("user_id")
            .eq("post_id", post.id)
            .eq("user_id", profile.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      profile
        ? supabase
            .from("favorites")
            .select("user_id")
            .eq("post_id", post.id)
            .eq("user_id", profile.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("comments")
        .select(
          "id, parent_id, content, created_at, likes_count, author_id, author:profiles!comments_author_id_fkey(username, nickname, avatar_url, level)",
        )
        .eq("post_id", post.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
    ]);

  if (!isOwner) {
    // 浏览计数放在响应之后执行，不阻塞首屏
    after(() => supabase.rpc("increment_post_views", { p_post_id: post.id }));
  }

  type RawComment = Omit<CommentItem, "liked">;
  const rawComments = (commentsResult.data ?? []) as unknown as RawComment[];

  let likedCommentIds = new Set<string>();
  if (profile && rawComments.length > 0) {
    const { data: likedRows } = await supabase
      .from("comment_likes")
      .select("comment_id")
      .eq("user_id", profile.id)
      .in(
        "comment_id",
        rawComments.map((comment) => comment.id),
      );
    likedCommentIds = new Set((likedRows ?? []).map((row) => row.comment_id));
  }

  const comments: CommentItem[] = rawComments.map((comment) => ({
    ...comment,
    liked: likedCommentIds.has(comment.id),
  }));

  const author = post.author;
  const authorName = author ? displayName(author) : "已注销用户";
  const tags = (post.post_tags ?? [])
    .map((row) => row.tags?.name)
    .filter((name): name is string => Boolean(name));
  const images = [...(post.post_images ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

  return (
    <article className="post-detail">
      <header className="post-detail__head">
        <div className="post-detail__flags">
          {post.is_pinned && <span className="badge badge--highlight">置顶</span>}
          {post.is_essence && <span className="badge badge--accent">精华</span>}
          {tags.map((tag) => (
            <Link
              key={tag}
              className="badge"
              href={`/tags/${encodeURIComponent(tag)}`}
            >
              #{tag}
            </Link>
          ))}
        </div>

        <h1>{post.title}</h1>

        <div className="post-detail__meta">
          {author && (
            <Link className="post-detail__author" href={`/u/${author.username}`}>
              {author.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="avatar avatar--lg"
                  src={author.avatar_url}
                  alt=""
                  width={40}
                  height={40}
                />
              ) : (
                <span className="avatar avatar--lg" aria-hidden="true">
                  {initialOf(authorName)}
                </span>
              )}
              <span>
                <b>{authorName}</b>
                <span className="muted"> · Lv.{author.level}</span>
              </span>
            </Link>
          )}
          <time dateTime={post.created_at} title={absoluteTime(post.created_at)}>
            {relativeTime(post.created_at)}
          </time>
          <span className="muted">👁 {compactNumber(post.views_count)}</span>
        </div>
      </header>

      <div className="panel panel__pad post-detail__body">
        <PostBody content={post.content} />

        {images.length > 0 && (
          <div className="post-gallery">
            {images.map((image) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={image.url}
                src={image.url}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ))}
          </div>
        )}

        <PostActions
          postId={post.id}
          title={post.title}
          initialLikes={post.likes_count}
          initialLiked={Boolean(likedResult.data)}
          initialFavorited={Boolean(favoritedResult.data)}
          favoritesCount={post.favorites_count}
          isOwner={isOwner}
          isStaff={isStaff}
          signedIn={Boolean(profile)}
        />

        <div className="post-detail__foot">
          <ReportButton postId={post.id} signedIn={Boolean(profile)} />
        </div>
      </div>

      <CommentSection
        postId={post.id}
        comments={comments}
        currentUserId={profile?.id ?? null}
        isStaff={isStaff}
        canComment={Boolean(profile) && !profile?.is_muted}
      />

      {author && (
        <aside className="panel panel__pad author-card">
          <div className="author-card__head">
            {author.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="avatar avatar--xl"
                src={author.avatar_url}
                alt=""
                width={56}
                height={56}
              />
            ) : (
              <span className="avatar avatar--xl" aria-hidden="true">
                {initialOf(authorName)}
              </span>
            )}
            <div>
              <b>{authorName}</b>
              <p className="muted">
                @{author.username} · Lv.{author.level}
              </p>
            </div>
          </div>
          {author.bio && <p>{author.bio}</p>}
          <p className="muted">
            {compactNumber(author.posts_count)} 篇创作 ·{" "}
            {compactNumber(author.followers_count)} 位关注者
          </p>
          <Link className="button button--ghost" href={`/u/${author.username}`}>
            查看主页
          </Link>
        </aside>
      )}
    </article>
  );
}
