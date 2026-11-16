"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<"resolved" | "dismissed" | null>(null);

  async function handle(status: "resolved" | "dismissed") {
    setBusy(status);
    const supabase = createSupabaseBrowserClient();
    await supabase.rpc("resolve_report", { p_report_id: reportId, p_status: status });
    setBusy(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="admin-actions">
      <button
        type="button"
        className="button button--primary"
        onClick={() => handle("resolved")}
        disabled={busy !== null}
      >
        {busy === "resolved" ? "处理中…" : "已处理"}
      </button>
      <button
        type="button"
        className="button button--ghost"
        onClick={() => handle("dismissed")}
        disabled={busy !== null}
      >
        {busy === "dismissed" ? "处理中…" : "驳回"}
      </button>
    </div>
  );
}
