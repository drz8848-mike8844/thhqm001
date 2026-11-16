import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "标签" };

type Row = {
  name: string;
  post_tags: { count: number }[] | null;
};

export default async function TagsPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tags")
    .select("name, post_tags(count)")
    .order("name", { ascending: true });

  if (error) console.error("[tags]", error.message);

  const tags = ((data ?? []) as unknown as Row[])
    .map((row) => ({
      name: row.name,
      count: row.post_tags?.[0]?.count ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"));

  return (
    <section aria-labelledby="tags-title">
      <div className="section-head">
        <h1 id="tags-title">标签</h1>
        <span className="section-head__meta">{tags.length} 个</span>
      </div>

      {tags.length === 0 ? (
        <p className="empty">还没有标签。发布文章时添加即可自动创建。</p>
      ) : (
        <ul className="tag-cloud" role="list">
          {tags.map((tag) => (
            <li key={tag.name}>
              <Link href={`/tags/${encodeURIComponent(tag.name)}`}>
                #{tag.name}
                <span>{tag.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
