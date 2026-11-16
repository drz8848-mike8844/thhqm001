"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const REASONS = [
  ["spam", "垃圾广告"],
  ["abuse", "人身攻击"],
  ["porn", "色情低俗"],
  ["political", "政治敏感"],
  ["other", "其他"],
] as const;

export function ReportButton({
  postId,
  signedIn,
}: {
  postId: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<string>("spam");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function open() {
    if (!signedIn) {
      router.push(`/login?next=/posts/${postId}`);
      return;
    }
    setDone(false);
    setError(null);
    dialogRef.current?.showModal();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("登录状态已过期，请重新登录");
      setBusy(false);
      return;
    }

    const { error: insertError } = await supabase.from("reports").insert({
      reporter_id: user.id,
      post_id: postId,
      reason: reason as "spam" | "abuse" | "porn" | "political" | "other",
      description: description.trim() || null,
    });

    if (insertError) {
      setError(`提交失败：${insertError.message}`);
      setBusy(false);
      return;
    }

    setBusy(false);
    setDone(true);
    setDescription("");
  }

  return (
    <>
      <button type="button" className="linklike" onClick={open}>
        举报
      </button>

      <dialog ref={dialogRef} className="dialog" aria-labelledby="report-title">
        <form className="form" onSubmit={submit}>
          <div className="dialog__head">
            <h2 id="report-title">举报这篇文章</h2>
            <button
              type="button"
              className="dialog__close"
              aria-label="关闭"
              onClick={() => dialogRef.current?.close()}
            >
              ✕
            </button>
          </div>

          {done ? (
            <>
              <p className="form-note" role="status">
                已收到你的举报，管理员会尽快处理。
              </p>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => dialogRef.current?.close()}
              >
                关闭
              </button>
            </>
          ) : (
            <>
              <fieldset className="field">
                <legend className="field__label">原因</legend>
                <div className="radio-list">
                  {REASONS.map(([value, label]) => (
                    <label key={value} className="radio">
                      <input
                        type="radio"
                        name="reason"
                        value={value}
                        checked={reason === value}
                        onChange={() => setReason(value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="field">
                <span className="field__label">补充说明（可选）</span>
                <textarea
                  className="field__input"
                  rows={3}
                  maxLength={1000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="具体哪里有问题？"
                />
              </label>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <div className="dialog__foot">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => dialogRef.current?.close()}
                >
                  取消
                </button>
                <button className="button button--primary" disabled={busy}>
                  {busy ? "提交中…" : "提交举报"}
                </button>
              </div>
            </>
          )}
        </form>
      </dialog>
    </>
  );
}
