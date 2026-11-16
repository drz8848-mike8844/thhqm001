"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { relativeTime } from "@/lib/format";

type Message = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

type Props = {
  conversationId: string;
  me: string;
  otherName: string;
  initialMessages: Message[];
};

export function MessageThread({
  conversationId,
  me,
  otherName,
  initialMessages,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    void supabase.rpc("mark_conversation_read", {
      p_conversation_id: conversationId,
    });
  }, [conversationId, supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) =>
            prev.some((message) => message.id === row.id) ? prev : [...prev, row],
          );
          if (row.sender_id !== me) {
            void supabase.rpc("mark_conversation_read", {
              p_conversation_id: conversationId,
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, me, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    setSending(true);
    setError(null);
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: me,
      content,
    });

    if (insertError) {
      setError(`发送失败：${insertError.message}`);
      setSending(false);
      return;
    }
    setDraft("");
    setSending(false);
  }

  return (
    <div className="thread">
      <ol className="thread__list" role="list">
        {messages.map((message) => {
          const mine = message.sender_id === me;
          return (
            <li
              key={message.id}
              className="bubble"
              data-mine={mine || undefined}
            >
              <p>{message.content}</p>
              <time dateTime={message.created_at}>
                {relativeTime(message.created_at)}
              </time>
            </li>
          );
        })}
        <li ref={bottomRef} aria-hidden="true" />
      </ol>

      <form className="thread__composer" onSubmit={send}>
        <label className="visually-hidden" htmlFor="message-input">
          发消息给 {otherName}
        </label>
        <textarea
          id="message-input"
          className="field__input"
          rows={2}
          maxLength={5000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`发消息给 ${otherName}…`}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="thread__composer-foot">
          {error ? (
            <span className="form-error" role="alert">
              {error}
            </span>
          ) : (
            <span className="muted">Ctrl / ⌘ + Enter 发送</span>
          )}
          <button
            className="button button--primary"
            disabled={sending || !draft.trim()}
          >
            {sending ? "发送中…" : "发送"}
          </button>
        </div>
      </form>
    </div>
  );
}
