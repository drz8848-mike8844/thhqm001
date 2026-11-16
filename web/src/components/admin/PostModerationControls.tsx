"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  postId: string;
  pinned: boolean;
  essence: boolean;
};

export function PostModerationControls({ postId, pinned, essence }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<"pin" | "essence" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(kind: "pin" | "essence") {
    setBusy(kind);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    const { error: rpcError } =
      kind === "pin"
        ? await supabase.rpc("set_post_pinned", { p_post_id: postId, p_pinned: !pinned })
        : await supabase.rpc("set_post_essence", {
            p_post_id: postId,
            p_essence: !essence,
          });

    if (rpcError) setError(rpcError.message);
    setBusy(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="admin-actions">
      <button
        type="button"
        className={pinned ? "button button--primary" : "button button--ghost"}
        onClick={() => toggle("pin")}
        disabled={busy !== null}
        aria-pressed={pinned}
      >
        {pinned ? "已置顶" : "置顶"}
      </button>
      <button
        type="button"
        className={essence ? "button button--primary" : "button button--ghost"}
        onClick={() => toggle("essence")}
        disabled={busy !== null}
        aria-pressed={essence}
      >
        {essence ? "已加精" : "加精"}
      </button>
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
