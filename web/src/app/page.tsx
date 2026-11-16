import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PostCard } from "@/components/PostCard";
import { compactNumber } from "@/lib/format";
import { listPosts, toCard } from "@/lib/posts";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const [{ posts, count }, hotResult, statsResult] = await Promise.all([
    listPosts(supabase, { limit: 6 }),
    supabase
      .from("hot_posts")
      .select("id, title, likes_count, comments_count, views_count")
      .limit(6),
    Promise.all([
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
    ]),
  ]);

  const hot = hotResult.data ?? [];
  const [postCount, userCount] = statsResult;

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <p className="hero__eyebrow">幻想乡的创作聚落</p>
        <h1 id="hero-title">
          把幻想乡的<em>每一次心动</em>写下来
        </h1>
        <p>
          图文、考据、改图、安科与日常随笔。这里不追求热闹，只想给认真创作的人一个安静、体面的地方。
        </p>
        <div className="hero__actions">
          <Link className="button button--primary" href="/posts/new">
            开始创作
          </Link>
          <Link className="button button--ghost" href="/hot">
            看看大家在写什么
          </Link>
        </div>
      </section>

      <div className="page--split">
        <section aria-labelledby="latest-title">
          <div className="section-head">
            <h2 id="latest-title">最新创作</h2>
            <span className="section-head__meta">
              {postCount.count != null ? `${compactNumber(postCount.count)} 篇` : ""}
            </span>
            <Link className="section-head__more" href="/posts">
              全部 →
            </Link>
          </div>

          {posts.length === 0 ? (
            <div className="empty">
              <strong>这里还很安静</strong>
              <p>第一篇文章的位置留给你。登录后即可发布第一篇创作。</p>
              <div className="hero__actions" style={{ justifyContent: "center" }}>
                <Link className="button button--primary" href="/posts/new">
                  发布第一篇
                </Link>
                <Link className="button button--ghost" href="/register">
                  注册账号
                </Link>
              </div>
            </div>
          ) : (
            <div className="post-grid">
              {posts.map((post) => (
                <PostCard key={post.id} post={toCard(post)} />
              ))}
            </div>
          )}
        </section>

        <aside className="sidebar" aria-label="侧栏">
          <section className="panel" aria-labelledby="hot-title">
            <div className="section-head panel__head">
              <h2 id="hot-title" className="panel__title">
                热门话题
              </h2>
              <Link className="section-head__more" href="/hot">
                更多
              </Link>
            </div>
            {hot.length === 0 ? (
              <p className="panel__pad muted">还没有足够的数据来计算热度。</p>
            ) : (
              <ol className="hot-list">
                {hot.map((item, index) => (
                  <li key={item.id ?? index}>
                    <span className="hot-list__rank" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Link href={`/posts/${item.id}`}>{item.title}</Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel panel__pad" aria-labelledby="about-title">
            <h2 id="about-title" className="panel__title">
              关于这里
            </h2>
            <p className="muted">
              东方幻绮梦是同人创作社区。尊重原作、尊重创作者，是这里唯一必须遵守的礼仪。
            </p>
            <ul className="stat-list">
              <li>
                <span className="stat-list__label">创作</span>
                <span className="stat-list__value">
                  {compactNumber(postCount.count ?? count ?? 0)}
                </span>
              </li>
              <li>
                <span className="stat-list__label">居民</span>
                <span className="stat-list__value">
                  {compactNumber(userCount.count ?? 0)}
                </span>
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
