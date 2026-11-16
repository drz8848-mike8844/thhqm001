import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  getCurrentProfile,
} from "@/lib/supabase/server";
import { PostEditor } from "@/components/PostEditor";

export const metadata: Metadata = { title: "编辑文章" };

type Row = {
  id: string;
  author_id: string;
  title: string;
  content: string;
  cover_image_url: string | null;
  post_tags: { tags: { name: string } | null }[] | null;
};

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=/posts/${id}/edit`);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("posts")
    .select("id, author_id, title, content, cover_image_url, post_tags(tags(name))")
    .eq("id", id)
    .maybeSingle();

  const post = data as unknown as Row | null;
  if (!post) notFound();

  const isStaff = profile.role === "mod" || profile.role === "owner";
  if (post.author_id !== profile.id && !isStaff) notFound();

  const tags = (post.post_tags ?? [])
    .map((row) => row.tags?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <section className="editor-page">
      <PostEditor
        mode="edit"
        userId={profile.id}
        postId={post.id}
        initialTitle={post.title}
        initialContent={post.content}
        initialCover={post.cover_image_url}
        initialTags={tags}
      />
    </section>
  );
}
