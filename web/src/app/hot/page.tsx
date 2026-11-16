import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { compactNumber, displayName, plainExcerpt, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "热门" };

type HotRow = {
  id: string | null;
  title: string | null;
  content: string | null;
  likes_count: number | null;
  comments_count: number | null;
  views_count: number | null;
  created_at: string | null;
  hot_score: number | null;
  author: {
    username: string;
    nickname: string | null;
    avatar_url: string | null;
    level: number;
  } | null;
};

export default async function HotPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("hot_posts")
    .select(
      "id, title, content, likes_count, comments_count, views_count, created_at, hot_score, author:profiles!posts_author_id_fkey(username, nickname, avatar_url, level)",
    )
    .limit(30);

  if (error) console.error("[hot]", error.message);
  const rows = (data ?? []) as unknown as HotRow[];

  return (
    <section aria-labelledby="hot-page-title">
      <div className="section-head">
        <h1 id="hot-page-title">热门</h1>
        <span className="section-head__meta">
          按互动与时间衰减计算，每小时更新
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="empty">还没有足够的数据。先去写点什么吧。</p>
      ) : (
        <ol className="rank-list">
          {rows.map((row, index) => (
            <li key={row.id ?? index} className="rank-item">
              <span className="rank-item__index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="rank-item__body">
                <h2>
                  <Link href={`/posts/${row.id}`}>{row.title}</Link>
                </h2>
                {row.content && (
                  <p className="muted">{plainExcerpt(row.content, 100)}</p>
                )}
                <div className="rank-item__meta">
                  {row.author && (
                    <span>
                      {displayName(row.author)} · Lv.{row.author.level}
                    </span>
                  )}
                  {row.created_at && (
                    <time dateTime={row.created_at}>
                      {relativeTime(row.created_at)}
                    </time>
                  )}
                  <span>♥ {compactNumber(row.likes_count ?? 0)}</span>
                  <span>💬 {compactNumber(row.comments_count ?? 0)}</span>
                  <span>👁 {compactNumber(row.views_count ?? 0)}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
