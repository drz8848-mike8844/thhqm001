import Link from "next/link";
import {
  compactNumber,
  displayName,
  initialOf,
  plainExcerpt,
  relativeTime,
} from "@/lib/format";

export type PostCardAuthor = {
  username: string;
  nickname: string | null;
  avatar_url: string | null;
  level: number;
} | null;

export type PostCardData = {
  id: string;
  title: string;
  content: string;
  cover_image_url: string | null;
  is_pinned: boolean;
  is_essence: boolean;
  likes_count: number;
  comments_count: number;
  views_count: number;
  created_at: string;
  author: PostCardAuthor;
  tags: string[];
};

export function PostCard({ post }: { post: PostCardData }) {
  const authorName = post.author ? displayName(post.author) : "已注销用户";

  return (
    <article className="post-card">
      {post.cover_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="post-card__cover"
          src={post.cover_image_url}
          alt=""
          loading="lazy"
          decoding="async"
          width={320}
          height={240}
        />
      )}

      <div className="post-card__head">
        {post.is_pinned && <span className="badge badge--highlight">置顶</span>}
        {post.is_essence && <span className="badge badge--accent">精华</span>}
        {post.tags.slice(0, 3).map((tag) => (
          <Link key={tag} className="badge" href={`/tags/${encodeURIComponent(tag)}`}>
            #{tag}
          </Link>
        ))}
      </div>

      <h3>
        <Link href={`/posts/${post.id}`}>{post.title}</Link>
      </h3>

      <p className="post-card__excerpt">{plainExcerpt(post.content)}</p>

      <div className="post-card__meta">
        <Link className="post-card__author" href={`/u/${post.author?.username ?? ""}`}>
          {post.author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="avatar"
              src={post.author.avatar_url}
              alt=""
              width={24}
              height={24}
              loading="lazy"
            />
          ) : (
            <span className="avatar" aria-hidden="true">
              {initialOf(authorName)}
            </span>
          )}
          <span>{authorName}</span>
          {post.author && (
            <span className="badge" aria-label={`等级 ${post.author.level}`}>
              Lv.{post.author.level}
            </span>
          )}
        </Link>

        <time dateTime={post.created_at}>{relativeTime(post.created_at)}</time>

        <span className="post-card__stats">
          <span title="浏览">👁 {compactNumber(post.views_count)}</span>
          <span title="点赞">♥ {compactNumber(post.likes_count)}</span>
          <span title="评论">💬 {compactNumber(post.comments_count)}</span>
        </span>
      </div>
    </article>
  );
}
