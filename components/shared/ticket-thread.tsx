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

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";

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
  attachment_url?: string | null;
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

interface ThreadItem {
  key: string;
  at: string;
  /** null for bot messages — they're never "mine" for anyone. */
  senderId: string | null;
  isBot: boolean;
  label: string | null;
  body: string;
  attachmentUrl: string | null;
  kbRefs: { title: string; score: number | null }[];
}

interface TicketThreadProps {
  /** Needed to resolve a signed URL for each attachment via GET /api/support/tickets/[id]/attachments — omit if this ticket has no attachments to show (e.g. not yet loaded). */
  ticketId?: string;
  currentUserId: string;
  /** The ticket owner's user id — used to attribute chatbot-transcript "user" turns, which have no sender_id of their own in the schema. Null for a guest ticket (no account). */
  ticketOwnerId: string | null;
  ticketBody: string;
  ticketCreatedAt: string;
  transcript: TranscriptMessage[];
  replies: ReplyMessage[];
}

export function TicketThread({ ticketId, currentUserId, ticketOwnerId, ticketBody, ticketCreatedAt, transcript, replies }: TicketThreadProps) {
  const { t } = useTranslation("common");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Every ticket created via the chatbot widget already has its opening
  // message duplicated as the last "user" turn in the transcript — only add
  // the ticket's own body as a standalone item when it ISN'T already there
  // (defensive: any future path that creates a ticket without a chatbot
  // session would otherwise show an empty thread).
  const bodyAlreadyInTranscript = transcript.some((m) => m.role === "user" && m.body === ticketBody);

  const items: ThreadItem[] = [
    ...(bodyAlreadyInTranscript
      ? []
      : [{ key: "ticket-body", at: ticketCreatedAt, senderId: ticketOwnerId, isBot: false, label: null, body: ticketBody, attachmentUrl: null, kbRefs: [] }]),
    ...transcript.map((m) => ({
      key: m.id,
      at: m.created_at,
      senderId: m.role === "user" ? ticketOwnerId : null,
      isBot: m.role === "bot",
      label: null,
      body: m.body,
      attachmentUrl: null,
      kbRefs: m.kbRefs ?? [],
    })),
    ...replies.map((r) => ({
      key: r.id,
      at: r.created_at,
      senderId: r.sender_id,
      isBot: false,
      label: r.sender_role === "admin" ? "Support team" : null,
      body: r.body,
      attachmentUrl: r.attachment_url ?? null,
      kbRefs: [] as { title: string; score: number | null }[],
    })),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  useEffect(() => {
    if (!ticketId) return;
    const missing = items.filter((item) => item.attachmentUrl && !signedUrls[item.key]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map(async (item) => {
      const response = await fetch(`/api/support/tickets/${ticketId}/attachments?path=${encodeURIComponent(item.attachmentUrl!)}`);
      const payload = await response.json().catch(() => ({}));
      return response.ok ? [item.key, payload.data?.signedUrl as string] as const : null;
    })).then((results) => {
      if (cancelled) return;
      const resolved = results.filter((r): r is readonly [string, string] => r !== null && !!r[1]);
      if (resolved.length === 0) return;
      setSignedUrls((previous) => ({ ...previous, ...Object.fromEntries(resolved) }));
    });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.key).join(","), ticketId]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">{t("ticket.noMessagesYet", { defaultValue: "No messages yet." })}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isMine = item.senderId !== null && item.senderId === currentUserId;
        const extension = item.attachmentUrl?.split(".").pop()?.toLowerCase() ?? "";
        const isImage = IMAGE_EXTENSIONS.has(extension);
        const attachmentSrc = item.attachmentUrl ? signedUrls[item.key] : undefined;
        return (
          <div key={item.key} className={isMine ? "ml-auto max-w-[85%]" : "max-w-[85%]"}>
            {item.isBot && <p className="text-[0.625rem] text-muted-foreground mb-0.5">{t("ticket.bot", { defaultValue: "Bot" })}</p>}
            {item.label && <p className="text-[0.625rem] text-muted-foreground mb-0.5">{isMine ? t("ticket.you", { defaultValue: "You" }) : t("ticket.supportTeam", { defaultValue: item.label })}</p>}
            {item.attachmentUrl && (
              <div className="mb-1">
                {isImage ? (
                  attachmentSrc ? (
                    <a href={attachmentSrc} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not an optimizable static asset */}
                      <img src={attachmentSrc} alt="Attachment" className="max-h-56 rounded-xl border border-border object-cover" />
                    </a>
                  ) : (
                    <div className="flex h-28 w-40 items-center justify-center rounded-xl border border-border bg-secondary text-xs text-muted-foreground">
                      {t("ticket.loadingAttachment", { defaultValue: "Loading…" })}
                    </div>
                  )
                ) : (
                  <a
                    href={attachmentSrc ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm ${attachmentSrc ? "hover:bg-secondary" : "pointer-events-none opacity-60"}`}
                  >
                    <FileText size={15} className="text-primary" /> {t("ticket.document", { defaultValue: "Document" })}
                  </a>
                )}
              </div>
            )}
            {item.body && (
            <div
              className={`rounded-xl px-3 py-2 text-sm ${
                item.isBot ? "bg-teal/10 text-foreground" : isMine ? "bg-primary text-white" : "bg-muted text-foreground"
              }`}
            >
              {item.body}
            </div>
            )}
            {item.kbRefs.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {item.kbRefs.map((r, j) => (
                  <span key={j} className="text-[0.625rem] px-1.5 py-0.5 rounded-full bg-teal/10 text-teal">
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
