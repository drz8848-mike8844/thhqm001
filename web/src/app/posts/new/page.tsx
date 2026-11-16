import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/server";
import { PostEditor } from "@/components/PostEditor";

export const metadata: Metadata = { title: "发布创作" };

export default async function NewPostPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/posts/new");

  const muted = profile.is_muted;

  return (
    <section className="editor-page">
      {muted ? (
        <div className="empty">
          <strong>你当前处于禁言状态</strong>
          <p>禁言期间无法发布新内容。如有疑问，可以联系管理员申诉。</p>
          <Link className="button button--ghost" href="/">
            返回首页
          </Link>
        </div>
      ) : (
        <PostEditor mode="create" userId={profile.id} />
      )}
    </section>
  );
}
