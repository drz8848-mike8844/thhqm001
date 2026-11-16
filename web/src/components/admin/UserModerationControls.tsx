"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Role = "user" | "mod" | "owner";

type Props = {
  userId: string;
  isMuted: boolean;
  mutedUntil: string | null;
  role: Role;
  viewerIsOwner: boolean;
  isSelf: boolean;
};

function formatUntil(iso: string | null): string {
  if (!iso) return "永久";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function UserModerationControls({
  userId,
  isMuted,
  mutedUntil,
  role,
  viewerIsOwner,
  isSelf,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supabase = createSupabaseBrowserClient();

  async function setMuted(muted: boolean, days?: number) {
    setBusy(muted ? `mute-${days ?? "forever"}` : "unmute");
    setError(null);
    const until =
      muted && days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
    const { error: rpcError } = await supabase.rpc("set_user_muted", {
      p_user: userId,
      p_muted: muted,
      p_until: until ?? undefined,
    });
    if (rpcError) setError(rpcError.message);
    setBusy(null);
    startTransition(() => router.refresh());
  }

  async function changeRole(next: Role) {
    if (next === role) return;
    if (!window.confirm(`确定将这位用户的角色改为「${next}」吗？`)) return;
    setBusy("role");
    setError(null);
    const { error: rpcError } = await supabase.rpc("set_user_role", {
      p_user: userId,
      p_role: next,
    });
    if (rpcError) setError(rpcError.message);
    setBusy(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="admin-actions">
      {isMuted ? (
        <>
          <span className="badge badge--highlight">
            禁言中{mutedUntil ? ` 至 ${formatUntil(mutedUntil)}` : "（永久）"}
          </span>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setMuted(false)}
            disabled={busy !== null}
          >
            {busy === "unmute" ? "处理中…" : "解除禁言"}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setMuted(true, 1)}
            disabled={busy !== null}
          >
            {busy === "mute-1" ? "处理中…" : "禁言 1 天"}
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setMuted(true, 7)}
            disabled={busy !== null}
          >
            {busy === "mute-7" ? "处理中…" : "禁言 7 天"}
          </button>
          <button
            type="button"
            className="button button--ghost danger"
            onClick={() => setMuted(true)}
            disabled={busy !== null}
          >
            {busy === "mute-forever" ? "处理中…" : "永久禁言"}
          </button>
        </>
      )}

      {viewerIsOwner && !isSelf && (
        <select
          className="role-select"
          value={role}
          onChange={(event) => changeRole(event.target.value as Role)}
          disabled={busy !== null}
          aria-label="修改角色"
        >
          <option value="user">user</option>
          <option value="mod">mod</option>
          <option value="owner">owner</option>
        </select>
      )}

      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
