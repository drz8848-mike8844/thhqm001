import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  getCurrentProfile,
} from "@/lib/supabase/server";
import { MessageThread } from "@/components/MessageThread";
import { displayName } from "@/lib/format";

export const metadata: Metadata = { title: "私信" };

type Conv = {
  id: string;
  participant_a: string;
  participant_b: string;
  a: { username: string; nickname: string | null } | null;
  b: { username: string; nickname: string | null } | null;
};

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect(`/login?next=/messages/${id}`);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("conversations")
    .select(
      "id, participant_a, participant_b, a:profiles!conversations_participant_a_fkey(username, nickname), b:profiles!conversations_participant_b_fkey(username, nickname)",
    )
    .eq("id", id)
    .maybeSingle();

  const conversation = data as unknown as Conv | null;
  if (
    !conversation ||
    (conversation.participant_a !== profile.id &&
      conversation.participant_b !== profile.id)
  ) {
    notFound();
  }

  const other =
    conversation.participant_a === profile.id ? conversation.b : conversation.a;
  const otherName = other ? displayName(other) : "对方";

  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_id, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  return (
    <section className="conversation-page" aria-labelledby="convo-title">
      <div className="section-head">
        <Link className="button button--ghost" href="/messages">
          ← 私信
        </Link>
        <h1 id="convo-title">{otherName}</h1>
        {other && (
          <Link className="section-head__more" href={`/u/${other.username}`}>
            查看主页
          </Link>
        )}
      </div>

      <MessageThread
        conversationId={conversation.id}
        me={profile.id}
        otherName={otherName}
        initialMessages={messages ?? []}
      />
    </section>
  );
}
