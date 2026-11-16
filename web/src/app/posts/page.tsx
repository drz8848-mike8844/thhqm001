import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PostCard } from "@/components/PostCard";
import { Pagination } from "@/components/Pagination";
import { PAGE_SIZE, listPosts, toCard } from "@/lib/posts";
import { compactNumber } from "@/lib/format";

export const metadata: Metadata = { title: "全部创作" };

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(Number(pageParam) || 1, 1);
  const supabase = await createSupabaseServerClient();
  const { posts, count } = await listPosts(supabase, { page });

  return (
    <section aria-labelledby="all-title">
      <div className="section-head">
        <h1 id="all-title">全部创作</h1>
        <span className="section-head__meta">{compactNumber(count)} 篇</span>
        <Link className="section-head__more" href="/posts/new">
          + 写一篇
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="empty">
          <strong>还没有文章</strong>
          <p>成为第一个在这里留下文字的人。</p>
          <Link className="button button--primary" href="/posts/new">
            发布第一篇
          </Link>
        </div>
      ) : (
        <div className="post-grid">
          {posts.map((post) => (
            <PostCard key={post.id} post={toCard(post)} />
          ))}
        </div>
      )}

      <Pagination
        page={page}
        total={count}
        pageSize={PAGE_SIZE}
        basePath="/posts"
      />
    </section>
  );
}
