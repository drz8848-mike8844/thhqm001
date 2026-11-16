import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PostCard } from "@/components/PostCard";
import { Pagination } from "@/components/Pagination";
import { PAGE_SIZE, listPosts, toCard } from "@/lib/posts";
import { compactNumber } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  return { title: `#${decodeURIComponent(tag)}` };
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ tag }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const name = decodeURIComponent(tag);
  const page = Math.max(Number(pageParam) || 1, 1);

  const supabase = await createSupabaseServerClient();
  const { posts, count } = await listPosts(supabase, { tag: name, page });

  return (
    <section aria-labelledby="tag-title">
      <div className="section-head">
        <h1 id="tag-title">#{name}</h1>
        <span className="section-head__meta">{compactNumber(count)} 篇</span>
        <Link className="section-head__more" href="/tags">
          全部标签 →
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className="empty">这个标签下还没有文章。</p>
      ) : (
        <div className="post-grid">
          {posts.map((post) => (
            <PostCard key={post.id} post={toCard(post)} />
          ))}
        </div>
      )}

      <Pagination page={page} total={count} pageSize={PAGE_SIZE} basePath={`/tags/${encodeURIComponent(name)}`} />
    </section>
  );
}
