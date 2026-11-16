"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.rpc("mark_all_notifications_read");
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      className="button button--ghost"
      onClick={markAll}
      disabled={disabled || busy || pending}
    >
      {busy || pending ? "处理中…" : "全部标为已读"}
    </button>
  );
}
