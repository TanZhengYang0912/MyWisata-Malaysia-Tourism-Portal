"use client";

// P4 — Member 4: shared ticket-thread renderer. CLAUDE-FIXES-2.md item 2.
//
// ⚠️ Bug this replaces: both the customer and admin ticket views used to
// align bubbles by a FIXED rule ("user"/"customer" role -> right, else
// left) — sender-relative, not viewer-relative. That's correct for the
// customer (their own messages are always role="user"/"customer") but wrong
// for the admin: it put an admin's OWN reply on the left and the
// customer's message on the right, backwards from every other chat UI.
//
// Fix: alignment is role-RELATIVE — isMine = the message's sender id equals
// the CURRENT VIEWER's id. One component, `currentUserId` passed in, used
// by both app/customer/support/[id]/page.tsx and app/admin/support/page.tsx
// (doc's own instruction: "don't build two").
//
// Bot messages have no sender at all — they always render left, with a
// distinct tint and a "Bot" label, so nobody mistakes an AI answer for a
// human reply from either side.

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export interface TranscriptMessage {
  id: string;
  role: "user" | "bot";
  body: string;
  created_at: string;
  kbRefs?: { title: string; score: number | null }[];
}

export interface ReplyMessage {
  id: string;
  sender_id: string;
  sender_role: "customer" | "admin";
  body: string;
  created_at: string;
}

interface ThreadItem {
  key: string;
  at: string;
  /** null for bot messages — they're never "mine" for anyone. */
  senderId: string | null;
  isBot: boolean;
  label: string | null;
  body: string;
  kbRefs: { title: string; score: number | null }[];
}

interface TicketThreadProps {
  currentUserId: string;
  /** The ticket owner's user id — used to attribute chatbot-transcript "user" turns, which have no sender_id of their own in the schema. Null for a guest ticket (no account). */
  ticketOwnerId: string | null;
  ticketBody: string;
  ticketCreatedAt: string;
  transcript: TranscriptMessage[];
  replies: ReplyMessage[];
}

export function TicketThread({ currentUserId, ticketOwnerId, ticketBody, ticketCreatedAt, transcript, replies }: TicketThreadProps) {
  const { t } = useTranslation("common");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Every ticket created via the chatbot widget already has its opening
  // message duplicated as the last "user" turn in the transcript — only add
  // the ticket's own body as a standalone item when it ISN'T already there
  // (defensive: any future path that creates a ticket without a chatbot
  // session would otherwise show an empty thread).
  const bodyAlreadyInTranscript = transcript.some((m) => m.role === "user" && m.body === ticketBody);

  const items: ThreadItem[] = [
    ...(bodyAlreadyInTranscript
      ? []
      : [{ key: "ticket-body", at: ticketCreatedAt, senderId: ticketOwnerId, isBot: false, label: null, body: ticketBody, kbRefs: [] }]),
    ...transcript.map((m) => ({
      key: m.id,
      at: m.created_at,
      senderId: m.role === "user" ? ticketOwnerId : null,
      isBot: m.role === "bot",
      label: null,
      body: m.body,
      kbRefs: m.kbRefs ?? [],
    })),
    ...replies.map((r) => ({
      key: r.id,
      at: r.created_at,
      senderId: r.sender_id,
      isBot: false,
      label: r.sender_role === "admin" ? "Support team" : null,
      body: r.body,
      kbRefs: [] as { title: string; score: number | null }[],
    })),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">{t("ticket.noMessagesYet", { defaultValue: "No messages yet." })}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isMine = item.senderId !== null && item.senderId === currentUserId;
        return (
          <div key={item.key} className={isMine ? "ml-auto max-w-[85%]" : "max-w-[85%]"}>
            {item.isBot && <p className="text-[10px] text-muted-foreground mb-0.5">{t("ticket.bot", { defaultValue: "Bot" })}</p>}
            {item.label && <p className="text-[10px] text-muted-foreground mb-0.5">{isMine ? t("ticket.you", { defaultValue: "You" }) : t("ticket.supportTeam", { defaultValue: item.label })}</p>}
            <div
              className={`rounded-xl px-3 py-2 text-sm ${
                item.isBot ? "bg-teal/10 text-foreground" : isMine ? "bg-primary text-white" : "bg-muted text-foreground"
              }`}
            >
              {item.body}
            </div>
            {item.kbRefs.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {item.kbRefs.map((r, j) => (
                  <span key={j} className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal/10 text-teal">
                    {r.title}
                    {r.score !== null ? ` · ${(r.score * 100).toFixed(0)}%` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
