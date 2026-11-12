import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TestElement, TestEvent, findElements, findOne, installTestDom, type TestDocument } from "@/components/shared/__tests__/render-test-dom";
import type { ChatMessage } from "@/backend/core/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, unknown>) => (opts && "name" in opts ? `${key}:${opts.name}` : key) }),
}));
vi.mock("next/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("lucide-react", () => {
  const Icon = (p: Record<string, unknown>) => <svg {...p} />;
  return Object.fromEntries(
    ["ArrowLeft", "Bell", "BellOff", "Check", "CheckCheck", "FileText", "Flag", "Languages", "MessageCircle", "Mic", "MicOff", "Paperclip", "Plus", "Receipt", "Reply", "Send", "Tag", "X"].map((name) => [name, Icon]),
  );
});
vi.mock("@/components/vendor/ai-writing-assistant", () => ({ default: () => null }));
vi.mock("@/hooks/use-speech-input", () => ({
  useSpeechInput: () => ({ isSupported: speechMockState.isSupported, isListening: speechMockState.isListening, transcript: "", start: () => {}, stop: () => {}, error: null }),
  resolveRecognitionLang: () => "en-US",
}));

import { ChatThreadPanel, fitChatTextarea } from "@/components/customer/chat-thread-panel";

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let document: TestDocument;
let container: TestElement;

function fetchResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function findButton(text: string) {
  return findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes(text));
}

function setValue(element: TestElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new TestEvent("input", { bubbles: true }));
}

async function renderInteractivePanel() {
  await act(async () => {
    root?.render(<ChatThreadPanel {...base} messages={[]} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  await click(findOne(container, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label") === "strictMigration.chat.reportConversation"));
}

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("ChatThreadPanel report recovery", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = undefined;
    }
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  it("shows a distinct already-reported state instead of a generic failure", async () => {
    fetchMock.mockResolvedValue(fetchResponse(409, { error: { code: "ALREADY_REPORTED" } }));
    await renderInteractivePanel();
    await click(findButton("ui.actions.submit"));

    expect(container.textContent).toContain("ui.chat.reportAlreadySubmitted");
    expect(container.textContent).not.toContain("strictMigration.chat.reportFailed");
  });

  it("offers sign-in and returns to the same customer chat after a 401", async () => {
    fetchMock.mockResolvedValue(fetchResponse(401, { error: { code: "UNAUTHORIZED" } }));
    await renderInteractivePanel();
    await click(findButton("ui.actions.submit"));

    const href = findOne(container, (element) => element.tagName === "A").getAttribute("href");
    expect(href).toBe(`/login?next=${encodeURIComponent("/customer?chat=t1")}`);
    expect(container.textContent).toContain("strictMigration.chat.reportSignInRequired");
  });

  it("keeps report details and allows retry after a confirmed pre-write read failure", async () => {
    fetchMock.mockResolvedValueOnce(fetchResponse(503, { error: { code: "READ_UNAVAILABLE" } }));
    fetchMock.mockResolvedValueOnce(fetchResponse(201, { data: { threadId: "t1", reason: "scam" } }));
    await renderInteractivePanel();
    const details = findOne(container, (element) => element.tagName === "TEXTAREA");
    setValue(details, "The seller asked me to pay outside the site.");
    await click(findButton("ui.actions.submit"));

    expect(container.textContent).toContain("strictMigration.chat.reportReadUnavailable");
    expect(findOne(container, (element) => element.tagName === "TEXTAREA").value).toBe("The seller asked me to pay outside the site.");
    await click(findButton("ui.actions.submit"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("ui.chat.reportSubmitted");
  });

  it("checks an unknown write result without resubmitting the report", async () => {
    fetchMock.mockResolvedValueOnce(fetchResponse(503, { error: { code: "WRITE_UNAVAILABLE" } }));
    fetchMock.mockResolvedValueOnce(fetchResponse(200, { data: { reported: false } }));
    fetchMock.mockResolvedValueOnce(fetchResponse(200, { data: { reported: true } }));
    await renderInteractivePanel();
    const details = findOne(container, (element) => element.tagName === "TEXTAREA");
    setValue(details, "The seller asked me to pay outside the site.");
    await click(findButton("ui.actions.submit"));

    expect(container.textContent).toContain("strictMigration.chat.reportWriteUnknown");
    expect(findElements(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("ui.actions.submit"))).toHaveLength(0);
    await click(findButton("strictMigration.chat.checkReportStatus"));
    expect(container.textContent).toContain("strictMigration.chat.reportNotFoundYet");
    await click(findButton("strictMigration.chat.checkReportStatus"));

    expect(fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith("/report") && (!init || init.method === "POST"))).toHaveLength(1);
    expect(container.textContent).toContain("ui.chat.reportAlreadySubmitted");
  });

  it("sends only one report when the user double-clicks while the result is pending", async () => {
    let finish: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    await renderInteractivePanel();
    const submit = findButton("ui.actions.submit");
    await act(async () => {
      submit.dispatchEvent(new TestEvent("click", { bubbles: true }));
      submit.dispatchEvent(new TestEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish?.(fetchResponse(201, { data: { threadId: "t1", reason: "scam" } }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain("ui.chat.reportSubmitted");
  });
});

const speechMockState = vi.hoisted(() => ({ isSupported: false, isListening: false }));

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
  it("groups attachment actions inside the mobile composer disclosure", () => {
    const markup = renderToStaticMarkup(<ChatThreadPanel {...base} messages={[]} onAttachOrder={() => {}} />);
    expect(markup).toContain("<details");
    expect(markup).toContain('aria-label="ui.chat.moreActions"');
    expect(markup).toContain('aria-label="strictMigration.chat.attachFile"');
    expect(markup).toContain('aria-label="ui.chat.attachOrder"');
  });

  it("shows mobile voice input while keeping desktop send available for an empty composer", () => {
    speechMockState.isSupported = true;
    let markup = "";
    try {
      markup = renderToStaticMarkup(<ChatThreadPanel {...base} messages={[]} />);
    } finally {
      speechMockState.isSupported = false;
    }
    expect(markup).toContain('aria-label="Speak your message"');
    const sendButton = markup.match(/<button[^>]*aria-label="ui.actions.send"[^>]*>/)?.[0] ?? "";
    expect(sendButton).toContain("hidden md:flex");
  });

  it("lets a multiline message grow to a bounded height and shrink again", () => {
    const markup = renderToStaticMarkup(<ChatThreadPanel {...base} messages={[]} />);
    const textareaTag = markup.match(/<textarea[^>]*>/)?.[0] ?? "";
    expect(textareaTag).toContain("max-h-30");
    expect(textareaTag).toContain("overflow-y-auto");

    const measurement = { scrollHeight: 164 };
    const textarea = {
      style: { height: "" },
      get scrollHeight() { return measurement.scrollHeight; },
    } as unknown as HTMLTextAreaElement;
    fitChatTextarea(textarea);
    expect(textarea.style.height).toBe("120px");

    measurement.scrollHeight = 52;
    fitChatTextarea(textarea);
    expect(textarea.style.height).toBe("52px");
  });

});
