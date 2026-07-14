"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCheck, MapPin, MessageCircle, Send } from "lucide-react";
import { sendMessage } from "@/backend/domains/identity";
import { formatChatTimestamp } from "@/lib/customer/chat-view";
import type { ChatMessage, ChatThread, Outlet, User } from "@/backend/core/types";

interface ChatThreadPanelProps {
  thread: ChatThread;
  outlet?: Outlet;
  messages: ChatMessage[];
  currentUser: User | null;
  showBack?: boolean;
  onMessageSent?: (message: ChatMessage) => void;
}

export function ChatThreadPanel({
  thread,
  outlet,
  messages,
  currentUser,
  showBack = false,
  onMessageSent,
}: ChatThreadPanelProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const messageText = text.trim();
    if (sending || !messageText || !currentUser) return;

    setSending(true);
    setError(null);
    try {
      const message = await sendMessage(thread.id, currentUser.id, "customer", messageText);
      setText("");
      onMessageSent?.(message);
    } catch {
      setError("We couldn't send that message. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const outletName = outlet?.name ?? "Vendor conversation";
  const outletInitial = outletName.trim().slice(0, 1).toUpperCase() || "V";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="border-b border-border px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          {showBack && (
            <Link
              href="/customer/chat"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
              aria-label="Back to conversations"
            >
              <ArrowLeft size={17} />
            </Link>
          )}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-white shadow-sm">
            {outletInitial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-foreground">{outletName}</h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                Vendor
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin size={12} />
              {outlet?.city || "Malaysia"}{outlet?.state ? `, ${outlet.state}` : ""}
            </p>
          </div>
          <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <MessageCircle size={14} className="text-primary" />
            Direct message
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
              <MessageCircle size={21} />
            </div>
            <p className="text-sm font-semibold text-foreground">Start the conversation</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
              Ask the vendor about availability, accessibility, or anything you need for your trip.
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            <div className="flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              Conversation
              <span className="h-px flex-1 bg-border" />
            </div>
            {messages.map((message) => {
              const isCustomer = message.senderRole === "customer";
              return (
                <div key={message.id} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[min(82%,520px)] ${isCustomer ? "items-end" : "items-start"} flex flex-col`}>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                        isCustomer
                          ? "rounded-br-md bg-primary text-white"
                          : "rounded-bl-md border border-border bg-card text-foreground"
                      }`}
                    >
                      {message.text}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                      <span>{formatChatTimestamp(message.sentAt)}</span>
                      {isCustomer && <CheckCheck size={13} className="text-primary" aria-label="Sent" />}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background px-5 py-4 sm:px-7">
        {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
        <form onSubmit={handleSend} className="mx-auto flex max-w-2xl items-end gap-2">
          <label className="sr-only" htmlFor="chat-message">
            Message {outletName}
          </label>
          <textarea
            id="chat-message"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Message ${outletName}…`}
            rows={1}
            className="min-h-11 flex-1 resize-none rounded-2xl border border-border bg-input-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
          <button
            type="submit"
            disabled={sending || !text.trim() || !currentUser}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </form>
        <p className="mx-auto mt-2 max-w-2xl text-[11px] text-muted-foreground">
          Messages are sent directly to the vendor through MyWisata.
        </p>
      </div>
    </div>
  );
}
