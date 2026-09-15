import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/backend/core/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts && "name" in opts ? `${key}:${opts.name}` : key) }),
}));
vi.mock("next/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("lucide-react", () => {
  const Icon = (p: Record<string, unknown>) => <svg {...p} />;
  return Object.fromEntries(
    ["ArrowLeft", "Bell", "BellOff", "Check", "CheckCheck", "FileText", "Flag", "Languages", "MessageCircle", "Mic", "MicOff", "Paperclip", "Receipt", "Reply", "Send", "Tag", "X"].map((name) => [name, Icon]),
  );
});
vi.mock("@/components/vendor/ai-writing-assistant", () => ({ default: () => null }));
vi.mock("@/hooks/use-speech-input", () => ({
  useSpeechInput: () => ({ isSupported: false, isListening: false, transcript: "", start: () => {}, stop: () => {}, error: null }),
  resolveRecognitionLang: () => "en-US",
}));

import { ChatThreadPanel } from "@/components/customer/chat-thread-panel";

const base = {
  threadId: "t1",
  currentUserId: "me",
  counterpart: { name: "Sunset Diving", online: true },
  onSend: async () => ({}) as ChatMessage,
};

function msg(over: Partial<ChatMessage>): ChatMessage {
  return { id: "m1", threadId: "t1", senderId: "me", senderRole: "customer", text: "", sentAt: "2026-03-05T00:00:00Z", ...over };
}

describe("ChatThreadPanel context + receipts", () => {
  it("renders a context card with a View link for a message that carries context", () => {
    const markup = renderToStaticMarkup(
      <ChatThreadPanel
        {...base}
        messages={[msg({ text: "is this available?", context: { type: "product", id: "p1", title: "Sunset Cruise", subtitle: "RM120.00", imageUrl: null, href: "/customer/activity/p1" } })]}
      />,
    );
    expect(markup).toContain("Sunset Cruise");
    expect(markup).toContain("RM120.00");
    expect(markup).toContain('href="/customer/activity/p1"');
    expect(markup).toContain("ui.chat.contextCard.view");
    expect(markup).toContain("is this available?"); // the text bubble still renders below the card
  });

  it("shows the inquiry banner above the composer when pendingContext is set", () => {
    const markup = renderToStaticMarkup(
      <ChatThreadPanel
        {...base}
        messages={[]}
        pendingContext={{ type: "product", productId: "p1", title: "Sunset Cruise", subtitle: "RM120.00", imageUrl: null, href: "/customer/activity/p1" }}
        onDismissContext={() => {}}
      />,
    );
    expect(markup).toContain("ui.chat.inquiryBanner.title");
    expect(markup).toContain("Sunset Cruise");
    expect(markup).toContain("ui.chat.inquiryBanner.dismiss");
  });

  it("marks my message read when its id is in readByOthers", () => {
    const readMarkup = renderToStaticMarkup(
      <ChatThreadPanel {...base} messages={[msg({ id: "x", text: "hi" })]} readByOthers={new Set(["x"])} />,
    );
    expect(readMarkup).toContain("strictMigration.chat.read");
    const plainMarkup = renderToStaticMarkup(
      <ChatThreadPanel {...base} messages={[msg({ id: "x", text: "hi" })]} />,
    );
    expect(plainMarkup).toContain("strictMigration.chat.sent");
    expect(plainMarkup).not.toContain("strictMigration.chat.read");
  });

  it("renders the attach-order button only when onAttachOrder is provided", () => {
    const withButton = renderToStaticMarkup(<ChatThreadPanel {...base} messages={[]} onAttachOrder={() => {}} />);
    expect(withButton).toContain("ui.chat.attachOrder");
    const withoutButton = renderToStaticMarkup(<ChatThreadPanel {...base} messages={[]} />);
    expect(withoutButton).not.toContain("ui.chat.attachOrder");
  });
});
