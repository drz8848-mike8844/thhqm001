"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function MessageButton({
  targetId,
  signedIn,
  isSelf,
}: {
  targetId: string;
  signedIn: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (isSelf) return null;

  async function open() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("get_or_create_conversation", {
      p_other: targetId,
    });
    if (error || !data) {
      setBusy(false);
      return;
    }
    router.push(`/messages/${data}`);
  }

  return (
    <button
      type="button"
      className="button button--ghost"
      onClick={open}
      disabled={busy}
    >
      {busy ? "打开中…" : "私信"}
    </button>
  );
}
