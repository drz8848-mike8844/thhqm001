"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { compactNumber, displayName, initialOf, relativeTime } from "@/lib/format";

export type CommentItem = {
  id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  likes_count: number;
  author_id: string;
  author: {
    username: string;
    nickname: string | null;
    avatar_url: string | null;
    level: number;
  } | null;
  liked: boolean;
};

type Props = {
  postId: string;
  comments: CommentItem[];
  currentUserId: string | null;
  isStaff: boolean;
  canComment: boolean;
};

export function CommentSection({
  postId,
  comments,
  currentUserId,
  isStaff,
  canComment,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [optimisticComments, addOptimistic] = useOptimistic(
    comments,
    (state: CommentItem[], next: CommentItem) => [...state, next],
  );

  const supabase = createSupabaseBrowserClient();
  const signedIn = Boolean(currentUserId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;
    if (!signedIn) {
      router.push(`/login?next=/posts/${postId}`);
      return;
    }
    if (!canComment) {
      setError("你当前处于禁言状态，暂时无法评论。");
      return;
    }

    setError(null);

    const optimistic: CommentItem = {
      id: `temp-${Date.now()}`,
      parent_id: replyTo?.id ?? null,
      content,
      created_at: new Date().toISOString(),
      likes_count: 0,
      author_id: currentUserId!,
      author: { username: "你", nickname: "你", avatar_url: null, level: 1 },
      liked: false,
    };

    startTransition(async () => {
      addOptimistic(optimistic);
      const { error: insertError } = await supabase.from("comments").insert({
        post_id: postId,
        author_id: currentUserId!,
        parent_id: replyTo?.id ?? null,
        content,
      });

      if (insertError) {
        setError(
          insertError.message.includes("row-level security")
            ? "发布失败：你可能被禁言，或登录状态已过期。"
            : `发布失败：${insertError.message}`,
        );
        return;
      }

      setDraft("");
      setReplyTo(null);
      router.refresh();
      requestAnimationFrame(() => {
        listRef.current?.lastElementChild?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
    });
  }

  async function toggleLike(comment: CommentItem) {
    if (!signedIn) {
      router.push(`/login?next=/posts/${postId}`);
      return;
    }
    setBusyId(comment.id);
    await supabase.rpc("toggle_comment_like", { p_comment_id: comment.id });
    setBusyId(null);
    router.refresh();
  }

  async function remove(comment: CommentItem) {
    if (!window.confirm("删除这条评论？")) return;
    setBusyId(comment.id);
    const { error: deleteError } = await supabase.rpc("soft_delete_comment", {
      p_comment_id: comment.id,
    });
    setBusyId(null);
    if (deleteError) {
      setError("删除失败，请稍后再试");
      return;
    }
    router.refresh();
  }

  return (
    <section className="comments" aria-labelledby="comments-title">
      <div className="section-head">
        <h2 id="comments-title">评论</h2>
        <span className="section-head__meta">{comments.length} 条</span>
      </div>

      <form className="comment-form" onSubmit={submit}>
        {replyTo && (
          <p className="comment-form__reply">
            回复 <b>{replyTo.author ? displayName(replyTo.author) : "已注销用户"}</b>
            <button
              type="button"
              className="linklike"
              onClick={() => setReplyTo(null)}
            >
              取消
            </button>
          </p>
        )}

        <label className="field">
          <span className="visually-hidden">写下评论</span>
          <textarea
            className="field__input"
            name="content"
            rows={4}
            maxLength={5000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={signedIn ? "友善地表达你的想法…" : "登录后即可评论"}
            disabled={pending}
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="comment-form__foot">
          <span className="muted">{draft.length}/5000</span>
          <button
            className="button button--primary"
            disabled={pending || !draft.trim()}
          >
            {pending ? "发布中…" : replyTo ? "发布回复" : "发表评论"}
          </button>
        </div>
      </form>

      {optimisticComments.length === 0 ? (
        <p className="muted">还没有评论，来说第一句吧。</p>
      ) : (
        <ul className="comment-list" ref={listRef}>
          {optimisticComments.map((comment) => {
            const name = comment.author
              ? displayName(comment.author)
              : "已注销用户";

            return (
              <li
                key={comment.id}
                className="comment"
                data-optimistic={comment.id.startsWith("temp-") || undefined}
              >
                <div className="comment__head">
                  {comment.author?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="avatar"
                      src={comment.author.avatar_url}
                      alt=""
                      width={28}
                      height={28}
                      loading="lazy"
                    />
                  ) : (
                    <span className="avatar" aria-hidden="true">
                      {initialOf(name)}
                    </span>
                  )}
                  <b>{name}</b>
                  {comment.author && (
                    <span className="badge">Lv.{comment.author.level}</span>
                  )}
                  <time className="muted" dateTime={comment.created_at}>
                    {relativeTime(comment.created_at)}
                  </time>
                </div>

                <p className="comment__body">{comment.content}</p>

                <div className="comment__actions">
                  <button
                    type="button"
                    className="linklike"
                    onClick={() => toggleLike(comment)}
                    disabled={busyId === comment.id}
                    aria-pressed={comment.liked}
                  >
                    {comment.liked ? "♥" : "♡"} {compactNumber(comment.likes_count)}
                  </button>
                  <button
                    type="button"
                    className="linklike"
                    onClick={() => setReplyTo(comment)}
                  >
                    回复
                  </button>
                  {signedIn &&
                    (comment.author_id === currentUserId || isStaff) && (
                      <button
                        type="button"
                        className="linklike danger"
                        onClick={() => remove(comment)}
                        disabled={busyId === comment.id}
                      >
                        删除
                      </button>
                    )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
