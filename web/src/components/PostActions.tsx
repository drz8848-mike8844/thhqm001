"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { compactNumber } from "@/lib/format";

type Props = {
  postId: string;
  title: string;
  initialLikes: number;
  initialLiked: boolean;
  initialFavorited: boolean;
  favoritesCount: number;
  isOwner: boolean;
  isStaff: boolean;
  signedIn: boolean;
};

export function PostActions({
  postId,
  title,
  initialLikes,
  initialLiked,
  initialFavorited,
  favoritesCount,
  isOwner,
  isStaff,
  signedIn,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [liked, setLiked] = useState(initialLiked);
  const [likes, setLikes] = useState(initialLikes);
  const [favorited, setFavorited] = useState(initialFavorited);
  const [favorites, setFavorites] = useState(favoritesCount);
  const [busy, setBusy] = useState<"like" | "favorite" | "delete" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function toggleLike() {
    if (!signedIn) {
      router.push(`/login?next=/posts/${postId}`);
      return;
    }
    setBusy("like");
    setMessage(null);

    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikes((n) => Math.max(n + (nextLiked ? 1 : -1), 0));

    const { error } = await supabase.rpc("toggle_post_like", { p_post_id: postId });
    if (error) {
      setLiked(!nextLiked);
      setLikes((n) => Math.max(n + (nextLiked ? -1 : 1), 0));
      setMessage("操作失败，请稍后再试");
    }
    setBusy(null);
  }

  async function toggleFavorite() {
    if (!signedIn) {
      router.push(`/login?next=/posts/${postId}`);
      return;
    }
    setBusy("favorite");
    setMessage(null);

    const next = !favorited;
    setFavorited(next);
    setFavorites((n) => Math.max(n + (next ? 1 : -1), 0));

    const { error } = await supabase.rpc("toggle_favorite", { p_post_id: postId });
    if (error) {
      setFavorited(!next);
      setFavorites((n) => Math.max(n + (next ? -1 : 1), 0));
      setMessage("操作失败，请稍后再试");
    }
    setBusy(null);
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setMessage("链接已复制");
      }
    } catch {
      /* 用户取消分享 */
    }
  }

  async function remove() {
    if (!window.confirm("确定删除这篇文章吗？删除后不会出现在列表里。")) return;
    setBusy("delete");
    const { error } = await supabase.rpc("soft_delete_post", { p_post_id: postId });
    if (error) {
      setMessage("删除失败，请稍后再试");
      setBusy(null);
      return;
    }
    startTransition(() => {
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <div className="post-actions">
      <button
        type="button"
        className="button button--primary"
        onClick={toggleLike}
        disabled={busy !== null}
        aria-pressed={liked}
      >
        <span aria-hidden="true">{liked ? "♥" : "♡"}</span>
        {liked ? "已赞" : "点赞"} · {compactNumber(likes)}
      </button>

      <button
        type="button"
        className="button button--ghost"
        onClick={toggleFavorite}
        disabled={busy !== null}
        aria-pressed={favorited}
      >
        <span aria-hidden="true">{favorited ? "★" : "☆"}</span>
        {favorited ? "已收藏" : "收藏"} · {compactNumber(favorites)}
      </button>

      <button type="button" className="button button--ghost" onClick={share}>
        分享
      </button>

      {(isOwner || isStaff) && (
        <>
          {isOwner && (
            <Link className="button button--ghost" href={`/posts/${postId}/edit`}>
              编辑
            </Link>
          )}
          <button
            type="button"
            className="button button--ghost danger"
            onClick={remove}
            disabled={busy !== null}
          >
            删除
          </button>
        </>
      )}

      {message && (
        <p className="form-note" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
