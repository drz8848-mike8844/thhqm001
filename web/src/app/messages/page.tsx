import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  getCurrentProfile,
} from "@/lib/supabase/server";
import { displayName, initialOf, relativeTime } from "@/lib/format";

export const metadata: Metadata = { title: "私信" };

type Person = {
  username: string;
  nickname: string | null;
  avatar_url: string | null;
};

type Conversation = {
  id: string;
  participant_a: string;
  participant_b: string;
  last_message_at: string;
  a: Person | null;
  b: Person | null;
};

export default async function MessagesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login?next=/messages");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, participant_a, participant_b, last_message_at, a:profiles!conversations_participant_a_fkey(username, nickname, avatar_url), b:profiles!conversations_participant_b_fkey(username, nickname, avatar_url)",
    )
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (error) console.error("[messages]", error.message);
  const conversations = (data ?? []) as unknown as Conversation[];

  const ids = conversations.map((row) => row.id);
  const lastByConversation = new Map<
    string,
    { content: string; created_at: string; sender_id: string; is_read: boolean }
  >();

  if (ids.length > 0) {
    const { data: messages } = await supabase
      .from("messages")
      .select("conversation_id, content, created_at, sender_id, is_read")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(300);

    for (const message of messages ?? []) {
      if (!lastByConversation.has(message.conversation_id)) {
        lastByConversation.set(message.conversation_id, message);
      }
    }
  }

  return (
    <section aria-labelledby="messages-title" className="messages-page">
      <div className="section-head">
        <h1 id="messages-title">私信</h1>
        <span className="section-head__meta">{conversations.length} 个会话</span>
      </div>

      {conversations.length === 0 ? (
        <div className="empty">
          <strong>还没有私信</strong>
          <p>在别人的主页点击「私信」即可开始对话。</p>
        </div>
      ) : (
        <ul className="convo-list" role="list">
          {conversations.map((conversation) => {
            const other =
              conversation.participant_a === profile.id
                ? conversation.b
                : conversation.a;
            const name = other ? displayName(other) : "未知用户";
            const last = lastByConversation.get(conversation.id);
            const unread = Boolean(
              last && !last.is_read && last.sender_id !== profile.id,
            );

            return (
              <li key={conversation.id} className="convo" data-unread={unread || undefined}>
                <Link className="convo__link" href={`/messages/${conversation.id}`}>
                  {other?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="avatar avatar--lg"
                      src={other.avatar_url}
                      alt=""
                      width={40}
                      height={40}
                      loading="lazy"
                    />
                  ) : (
                    <span className="avatar avatar--lg" aria-hidden="true">
                      {initialOf(name)}
                    </span>
                  )}
                  <span className="convo__body">
                    <span className="convo__head">
                      <b>{name}</b>
                      <time dateTime={conversation.last_message_at}>
                        {relativeTime(conversation.last_message_at)}
                      </time>
                    </span>
                    <span className="convo__preview">
                      {last
                        ? `${last.sender_id === profile.id ? "我：" : ""}${last.content}`
                        : "开始聊天吧"}
                    </span>
                  </span>
                  {unread && <span className="convo__dot" aria-label="有未读消息" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
