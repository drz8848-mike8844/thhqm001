import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  getCurrentProfile,
} from "@/lib/supabase/server";
import { MarkAllReadButton } from "@/components/MarkAllReadButton";
import { displayName, initialOf, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "通知" };

type Row = {
  id: string;
  type: string;
  verb: string;
  url: string | null;
  is_read: boolean;
  created_at: string;
  actor: {
    username: string;
    nickname: string | null;
    avatar_url: string | null;
  } | null;
};

const TYPE_ICON: Record<string, string> = {
  like: "♥",
  comment: "💬",
  reply: "↩",
  follow: "＋",
  message: "✉",
  mention: "@",
  essence: "✦",
  moderation: "⚑",
  system: "•",
};

export default async function NotificationsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/notifications");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, type, verb, url, is_read, created_at, actor:profiles!notifications_actor_id_fkey(username, nickname, avatar_url)",
    )
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) console.error("[notifications]", error.message);
  const rows = (data ?? []) as unknown as Row[];
  const unread = rows.filter((row) => !row.is_read).length;

  return (
    <section aria-labelledby="notif-title">
      <div className="section-head">
        <h1 id="notif-title">通知</h1>
        <span className="section-head__meta">
          {unread > 0 ? `${unread} 条未读` : "全部已读"}
        </span>
        <MarkAllReadButton disabled={unread === 0} />
      </div>

      {rows.length === 0 ? (
        <p className="empty">暂时还没有通知。</p>
      ) : (
        <ul className="notif-list" role="list">
          {rows.map((row) => {
            const name = row.actor ? displayName(row.actor) : "系统";
            const body = (
              <>
                {row.actor &&
                  (row.actor.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="avatar"
                      src={row.actor.avatar_url}
                      alt=""
                      width={32}
                      height={32}
                      loading="lazy"
                    />
                  ) : (
                    <span className="avatar" aria-hidden="true">
                      {initialOf(name)}
                    </span>
                  ))}
                {!row.actor && (
                  <span className="avatar" aria-hidden="true">
                    {TYPE_ICON[row.type] ?? "•"}
                  </span>
                )}
                <span className="notif-list__text">
                  <b>{name}</b> {row.verb}
                </span>
                <time className="muted" dateTime={row.created_at}>
                  {relativeTime(row.created_at)}
                </time>
              </>
            );

            return (
              <li
                key={row.id}
                className="notif"
                data-unread={!row.is_read || undefined}
              >
                {row.url ? (
                  <Link className="notif__link" href={row.url}>
                    {body}
                  </Link>
                ) : (
                  <div className="notif__link">{body}</div>
                )}
                <span className="notif__type" aria-hidden="true">
                  {TYPE_ICON[row.type] ?? "•"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
