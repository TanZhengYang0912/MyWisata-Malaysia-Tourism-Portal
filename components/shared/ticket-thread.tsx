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
import { Button } from "@/components/ui/button";

export interface ReplyMessage {
  id: string;
  is_mine: boolean;
  sender_role: "customer" | "admin";
  body: string;
  created_at: string;
  attachment_type?: "image" | "document" | null;
}

interface ThreadItem {
  key: string;
  at: string;
  isMine: boolean;
  isBot: boolean;
  label: string | null;
  body: string;
  handoffSourceMessage?: string | null;
  attachmentType: "image" | "document" | null;
}

interface TicketThreadProps {
  /** Used to build the same-origin, owner-checked reply attachment route. */
  ticketId?: string;
  ticketIsMine: boolean;
  ticketBody: string;
  handoffSourceMessage?: string | null;
  ticketCreatedAt: string;
  replies: ReplyMessage[];
  hasEarlierReplies?: boolean;
  loadingEarlierReplies?: boolean;
  earlierRepliesError?: boolean;
  onLoadEarlierReplies?: () => void;
}

export function TicketThread({ ticketId, ticketIsMine, ticketBody, handoffSourceMessage, ticketCreatedAt, replies, hasEarlierReplies = false, loadingEarlierReplies = false, earlierRepliesError = false, onLoadEarlierReplies }: TicketThreadProps) {
  const { t } = useTranslation("common");
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastItemKeyRef = useRef<string | null>(null);
  const [failedAttachments, setFailedAttachments] = useState<Record<string, boolean>>({});
  const [attachmentAttempts, setAttachmentAttempts] = useState<Record<string, number>>({});
  const [downloadingAttachments, setDownloadingAttachments] = useState<Record<string, boolean>>({});

  async function downloadAttachment(replyId: string, href: string) {
    if (downloadingAttachments[replyId]) return;
    setDownloadingAttachments((current) => ({ ...current, [replyId]: true }));
    setFailedAttachments((current) => ({ ...current, [replyId]: false }));
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error("attachment_unavailable");
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "support-attachment.pdf";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch {
      setFailedAttachments((current) => ({ ...current, [replyId]: true }));
    } finally {
      setDownloadingAttachments((current) => ({ ...current, [replyId]: false }));
    }
  }

  const items: ThreadItem[] = [
    { key: "ticket-body", at: ticketCreatedAt, isMine: ticketIsMine, isBot: false, label: null, body: ticketBody, handoffSourceMessage, attachmentType: null },
    ...replies.map((r) => ({
      key: r.id,
      at: r.created_at,
      isMine: r.is_mine,
      isBot: false,
      label: r.sender_role === "admin" ? "Support team" : null,
      body: r.body,
      attachmentType: r.attachment_type ?? null,
    })),
  ].sort((a, b) => a.at === b.at ? a.key.localeCompare(b.key) : a.at < b.at ? -1 : 1);
  const lastItemKey = items.at(-1)?.key ?? null;

  useEffect(() => {
    if (lastItemKeyRef.current !== lastItemKey) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    lastItemKeyRef.current = lastItemKey;
  }, [lastItemKey]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">{t("ticket.noMessagesYet")}</p>;
  }

  return (
    <div className="space-y-2">
      {hasEarlierReplies && onLoadEarlierReplies && (
        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-1">
            {earlierRepliesError && <p role="alert" className="text-xs text-destructive">{t("chatbot.supportErrors.readUnavailable")}</p>}
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onLoadEarlierReplies} disabled={loadingEarlierReplies}>
              {loadingEarlierReplies ? t("states.loadingEllipsis") : earlierRepliesError ? t("chatbot.faq.retry") : t("chatbot.history.loadEarlier")}
            </Button>
          </div>
        </div>
      )}
      {items.map((item) => {
        const isMine = item.isMine;
        const isImage = item.attachmentType === "image";
        const attachmentSrc = ticketId && item.attachmentType
          ? `/api/support/tickets/${ticketId}/attachments/${item.key}`
          : undefined;
        return (
          <div key={item.key} className={isMine ? "ml-auto w-fit max-w-[85%]" : "w-fit max-w-[85%]"}>
            {item.isBot && <p className="text-[0.625rem] text-muted-foreground mb-0.5">{t("ticket.bot")}</p>}
            {item.label && <p className="text-[0.625rem] text-muted-foreground mb-0.5">{isMine ? t("ticket.you") : t("ticket.supportTeam")}</p>}
            {item.attachmentType && (
              <div className="mb-1">
                {isImage ? (
                  <a href={attachmentSrc ?? "#"} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin endpoint */}
                    <img
                      loading="lazy"
                      src={`${attachmentSrc}?retry=${attachmentAttempts[item.key] ?? 0}`}
                      alt={t("ticket.attachment")}
                      onError={() => setFailedAttachments((current) => ({ ...current, [item.key]: true }))}
                      onLoad={() => setFailedAttachments((current) => ({ ...current, [item.key]: false }))}
                      className="max-h-56 rounded-xl border border-border object-cover"
                    />
                  </a>
                ) : (
                  <button type="button" onClick={() => attachmentSrc && void downloadAttachment(item.key, attachmentSrc)} disabled={!attachmentSrc || downloadingAttachments[item.key]} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-60">
                    <FileText size={15} className="text-primary" /> {downloadingAttachments[item.key] ? t("ticket.loadingAttachment") : t("ticket.document")}
                  </button>
                )}
                {failedAttachments[item.key] && <p role="alert" className="mt-1 text-xs text-destructive">{t("ticket.attachmentUnavailable")}</p>}
                {failedAttachments[item.key] && (
                  <button type="button" onClick={() => {
                    if (isImage) {
                      setFailedAttachments((current) => ({ ...current, [item.key]: false }));
                      setAttachmentAttempts((current) => ({ ...current, [item.key]: (current[item.key] ?? 0) + 1 }));
                    } else if (attachmentSrc) {
                      void downloadAttachment(item.key, attachmentSrc);
                    }
                  }} className="text-xs text-primary underline">
                    {t("ticket.retryAttachment")}
                  </button>
                )}
              </div>
            )}
            {(item.body || item.handoffSourceMessage) && (
            <div
              className={`w-fit max-w-full break-words rounded-xl px-3 py-2 text-sm ${
                item.isBot ? "bg-teal/10 text-foreground" : isMine ? "bg-primary text-white" : "bg-muted text-foreground"
              }`}
            >
              {item.handoffSourceMessage && (
                <blockquote className="mb-2 border-l-2 border-current/40 pl-2">
                  <p className="mb-1 text-xs font-medium">{t("chatbot.handoff.selectedQuestion")}</p>
                  <p className="whitespace-pre-wrap break-words">{item.handoffSourceMessage}</p>
                </blockquote>
              )}
              {item.body}
            </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
