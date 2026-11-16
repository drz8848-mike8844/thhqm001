"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { compactNumber } from "@/lib/format";

type Props = {
  targetId: string;
  initialFollowing: boolean;
  initialFollowers: number;
  signedIn: boolean;
  isSelf: boolean;
};

export function FollowButton({
  targetId,
  initialFollowing,
  initialFollowers,
  signedIn,
  isSelf,
}: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [followers, setFollowers] = useState(initialFollowers);
  const [busy, setBusy] = useState(false);

  if (isSelf) {
    return (
      <a className="button button--ghost" href="/settings">
        编辑资料
      </a>
    );
  }

  async function toggle() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    setBusy(true);
    const next = !following;
    setFollowing(next);
    setFollowers((n) => Math.max(n + (next ? 1 : -1), 0));

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.rpc("toggle_follow", { p_target: targetId });
    if (error) {
      setFollowing(!next);
      setFollowers((n) => Math.max(n + (next ? -1 : 1), 0));
    } else {
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="follow">
      <button
        type="button"
        className={following ? "button button--ghost" : "button button--primary"}
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
      >
        {following ? "已关注" : "关注"}
      </button>
      <span className="muted">
        {compactNumber(followers)} 位关注者
      </span>
    </div>
  );
}
