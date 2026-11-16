import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  getCurrentProfile,
} from "@/lib/supabase/server";
import { PostCard } from "@/components/PostCard";
import { POST_CARD_SELECT, toCard, type RawPost } from "@/lib/posts";

export const metadata: Metadata = { title: "我的收藏" };

export default async function FavoritesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/favorites");

  const supabase = await createSupabaseServerClient();
  const { data: favoriteRows } = await supabase
    .from("favorites")
    .select("post_id, created_at")
    .order("created_at", { ascending: false })
    .limit(60);

  const ids = (favoriteRows ?? []).map((row) => row.post_id);
  let posts: RawPost[] = [];

  if (ids.length > 0) {
    const { data } = await supabase
      .from("posts")
      .select(POST_CARD_SELECT)
      .in("id", ids)
      .is("deleted_at", null);

    const map = new Map(
      ((data ?? []) as unknown as RawPost[]).map((post) => [post.id, post]),
    );
    posts = ids
      .map((id) => map.get(id))
      .filter((post): post is RawPost => Boolean(post));
  }

  return (
    <section aria-labelledby="favorites-title">
      <div className="section-head">
        <h1 id="favorites-title">我的收藏</h1>
        <span className="section-head__meta">{posts.length} 篇</span>
      </div>

      {posts.length === 0 ? (
        <div className="empty">
          <strong>收藏夹还是空的</strong>
          <p>在文章底部点击「收藏」，之后就能在这里找到它。</p>
          <a className="button button--ghost" href="/posts">
            去逛逛
          </a>
        </div>
      ) : (
        <div className="post-grid">
          {posts.map((post) => (
            <PostCard key={post.id} post={toCard(post)} />
          ))}
        </div>
      )}
    </section>
  );
}
