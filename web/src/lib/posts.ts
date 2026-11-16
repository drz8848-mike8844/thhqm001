import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { PostCardData } from "@/components/PostCard";

export type Client = SupabaseClient<Database>;

export type RawPost = {
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
  author: {
    username: string;
    nickname: string | null;
    avatar_url: string | null;
    level: number;
  } | null;
  post_tags: { tags: { name: string } | null }[] | null;
};

export const POST_CARD_SELECT =
  "id, title, content, cover_image_url, is_pinned, is_essence, likes_count, comments_count, views_count, created_at, author:profiles!posts_author_id_fkey(username, nickname, avatar_url, level), post_tags(tags(name))";

export function toCard(post: RawPost): PostCardData {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    cover_image_url: post.cover_image_url,
    is_pinned: post.is_pinned,
    is_essence: post.is_essence,
    likes_count: post.likes_count,
    comments_count: post.comments_count,
    views_count: post.views_count,
    created_at: post.created_at,
    author: post.author,
    tags: (post.post_tags ?? [])
      .map((row) => row.tags?.name)
      .filter((name): name is string => Boolean(name)),
  };
}

export const PAGE_SIZE = 12;

type ListOptions = {
  page?: number;
  limit?: number;
  authorId?: string;
  tag?: string;
  essenceOnly?: boolean;
};

/** 按时间倒序列出帖子（置顶优先），带总数 */
export async function listPosts(supabase: Client, options: ListOptions = {}) {
  const limit = options.limit ?? PAGE_SIZE;
  const page = Math.max(options.page ?? 1, 1);
  const offset = (page - 1) * limit;

  let query = supabase
    .from("posts")
    .select(POST_CARD_SELECT, { count: "exact" })
    .is("deleted_at", null);

  if (options.authorId) query = query.eq("author_id", options.authorId);
  if (options.essenceOnly) query = query.eq("is_essence", true);
  if (options.tag) {
    const { data: tagRow } = await supabase
      .from("tags")
      .select("id")
      .eq("name", options.tag)
      .maybeSingle();

    if (!tagRow) return { posts: [] as RawPost[], count: 0 };

    const { data: links } = await supabase
      .from("post_tags")
      .select("post_id")
      .eq("tag_id", tagRow.id);

    const ids = (links ?? []).map((row) => row.post_id);
    if (ids.length === 0) return { posts: [] as RawPost[], count: 0 };
    query = query.in("id", ids);
  }

  const { data, error, count } = await query
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[posts] 列表查询失败:", error.message);
    return { posts: [] as RawPost[], count: 0 };
  }

  return { posts: (data ?? []) as unknown as RawPost[], count: count ?? 0 };
}
