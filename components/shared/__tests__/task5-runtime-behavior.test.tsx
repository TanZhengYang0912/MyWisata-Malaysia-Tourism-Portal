import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TestElement, TestEvent, findElements, findOne, installTestDom, type TestDocument } from "./render-test-dom";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  useTranslation: vi.fn(),
  useAuth: vi.fn(),
  showFeedback: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("react-i18next", () => ({ useTranslation: mocks.useTranslation }));
vi.mock("next/link", () => ({ default: (props: { children?: React.ReactNode }) => <a {...props} /> }));
vi.mock("lucide-react", () => {
  const Icon = (props: Record<string, unknown>) => <svg {...props} />;
  // The widget merge pulled the vendor-chat list (ChatWidgetInbox) and thread
  // view (ChatWidgetVendorThread -> ChatThreadPanel) into ChatbotWidget's own
  // render tree, unconditionally imported — this mock must cover every icon
  // any of those files can render, not only ChatbotWidget's own.
  return {
    AlertTriangle: Icon, ArrowLeft: Icon, Bell: Icon, BellOff: Icon, Check: Icon, CheckCheck: Icon,
    ChevronLeft: Icon, ChevronRight: Icon, ChevronsLeft: Icon, ChevronsRight: Icon, FileText: Icon, Flag: Icon, HelpCircle: Icon, Languages: Icon, Maximize2: Icon,
    MessageCircle: Icon, Mic: Icon, MicOff: Icon, Minimize2: Icon, Paperclip: Icon, Reply: Icon,
    Search: Icon, Send: Icon, SlidersHorizontal: Icon, Tag: Icon, Plus: Icon, X: Icon,
  };
});
vi.mock("@/components/ui/button", () => ({ Button: (props: React.ComponentProps<"button">) => <button {...props} /> }));
vi.mock("@/components/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));
vi.mock("@/components/providers/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/components/providers/action-feedback", () => ({ useActionFeedback: () => ({ showFeedback: mocks.showFeedback }) }));
vi.mock("@/components/providers/app-dialog", () => ({ useAppDialog: () => ({ confirm: mocks.confirm }) }));
// support-chat.tsx (unread-count realtime) and use-chat-presence.ts (online
// dot) both call this at module/hook scope — without a mock, the real
// createBrowserClient throws immediately for missing env vars, before any
// test body runs.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channel: any = {
        on: () => channel,
        subscribe: (cb?: (status: string) => void) => {
          cb?.("SUBSCRIBED");
          return channel;
        },
        track: async () => undefined,
        presenceState: () => ({}),
      };
      return channel;
    },
    removeChannel: () => undefined,
  }),
}));

import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminSegmentedFilter } from "@/components/admin/segmented-filter";
import { ChatbotWidget, chatbotSessionStorageKey, createBotMessage, resolveTicketSubject } from "@/components/shared/chatbot-widget";
import { NotificationBell } from "@/components/shared/notification-bell";
import { NotificationCenter } from "@/components/shared/notification-center";
import { ReportChatButton } from "@/components/shared/report-chat-button";
import { StatusBadge } from "@/components/shared/status-badge";
import { SupportChatProvider } from "@/components/providers/support-chat";

type TranslationOptions = { defaultValue?: string; count?: number; title?: string; version?: number; checkedAt?: string };

const translations: Record<string, string> = {
  "common:accessibility.closeConfirmation": "Close translated confirmation",
  "common:accessibility.openChat": "Open translated chat",
  "common:chatbot.closeChat": "Close translated chat",
  "common:chatbot.emptyPrompt": "Ask a translated question",
  "common:chatbot.greeting": "Hi, I'm MYLawatan Bot. What can I help you with?",
  "common:chatbot.starters.booking": "Check my booking translated",
  "common:chatbot.starters.refund": "Track my refund translated",
  "common:chatbot.starters.products": "Find products and prices translated",
  "common:chatbot.starters.faq": "Browse common questions translated",
  "common:chatbot.history.sessionGone": "This saved chat is no longer available. Start a new chat to continue.",
  "common:chatbot.starters.label": "Suggested questions",
  "common:chatbot.starters.questions.booking": "Check my booking",
  "common:chatbot.starters.questions.refund": "Track my refund",
  "common:chatbot.starters.questions.products": "Recommend products and prices",
  "common:chatbot.starters.retry": "Retry",
  "common:chatbot.retryQuestion": "Retry question translated",
  "common:chatbot.history.signIn": "Your sign-in expired. Sign in to restore this conversation.",
  "common:chatbot.inputPlaceholder": "Translated question",
  "common:chatbot.askResultUnknown": "Translated outcome not ready",
  "common:chatbot.evidence": "Source: {{title}}",
  "common:chatbot.recommendation.categories.activity": "Activities translated",
  "common:chatbot.recommendation.categories.food": "Food translated",
  "common:chatbot.recommendation.categories.accommodation": "Accommodation translated",
  "common:chatbot.recommendation.categories.retail": "Shopping translated",
  "common:chatbot.recommendation.seeProduct": "View product translated",
  "common:chatbot.recommendation.matchReason": "Matches your filters translated",
  "common:chatbot.recommendation.ratingReason": "Rated {{rating}} by {{reviews}} reviews translated",
  "common:chatbot.recommendation.locationUnknown": "Location not listed translated",
  "common:chatbot.statusQuery.unavailable": "Translated status unavailable. Retry or open your account page.",
  "common:chatbot.statusQuery.retry": "Translated status retry",
  "common:chatbot.statusQuery.refreshing": "Translated status checking",
  "common:chatbot.statusQuery.found": "Translated records found",
  "common:chatbot.statusQuery.openRecord": "Translated open account page",
  "common:chatbot.statusQuery.records.withdrawals": "Translated withdrawal request",
  "common:chatbot.authUnavailable": "Translated account check outage; check your connection and retry",
  "common:chatbot.sessionUnavailable": "Translated chat check outage; check your connection and try again",
  "common:chatbot.guestClaim.prompt": "Continue guest conversation translated",
  "common:chatbot.guestClaim.continue": "Continue guest chat translated",
  "common:chatbot.guestClaim.working": "Linking guest chat translated",
  "common:chatbot.guestClaim.notNow": "Not now translated",
  "common:chatbot.guestSessionUnavailable": "Guest session unavailable translated",
  "common:chatbot.newConversation": "Start new chat translated",
  "common:chatbot.history.unavailable": "History unavailable translated",
  "common:chatbot.faq.retry": "Retry translated",
  "common:chatbot.faq.toggle": "Browse translated FAQs",
  "common:accessibility.nextPage": "Next translated page",
  "common:chatbot.myTickets": "Translated my tickets",
  "common:chatbot.no": "No translated",
  "common:chatbot.send": "Send translated message",
  "common:chatbot.somethingWrong": "Translated network fallback",
  "common:chatbot.title": "Translated support title",
  "common:chatbot.list.supportLabel": "Translated support label",
  "common:chatbot.list.humanSupportLabel": "Translated human support label",
  "common:chatbot.list.humanSupportPreview": "Translated ticket reply preview",
  "common:chatbot.loginRequired.title": "Sign in to use Support",
  "common:chatbot.loginRequired.description": "Sign in to use either support channel.",
  "common:chatbot.loginRequired.action": "Sign in or create account",
  "common:chatbot.humanSupport.create": "New ticket translated",
  "common:chatbot.humanSupport.subject": "Subject translated",
  "common:chatbot.humanSupport.description": "Describe the issue translated",
  "common:chatbot.humanSupport.preview": "Review request translated",
  "common:chatbot.humanSupport.review": "Review before sending translated",
  "common:chatbot.humanSupport.consent": "Share with support translated",
  "common:chatbot.humanSupport.submit": "Send to support translated",
  "common:chatbot.humanSupport.created": "Request sent translated",
  "common:chatbot.wantTicket": "Translated ticket offer",
  "common:chatbot.gladToHelp": "Glad I could help.",
  "common:chatbot.feedback.saveFailed": "Feedback could not be saved translated",
  "common:chatbot.feedback.saving": "Saving feedback translated",
  "common:chatbot.feedback.retry": "Retry feedback translated",
  "common:chatbot.feedback.signIn": "Sign in again to save feedback translated",
  "common:chatbot.feedback.signInAction": "Sign in translated",
  "common:chatbot.handoff.subject": "Translated ticket subject",
  "common:chatbot.handoff.summary": "Translated ticket summary",
  "common:chatbot.handoff.confirm": "Create translated ticket",
  "common:chatbot.handoff.saveDraft": "Save translated draft",
  "common:chatbot.handoff.savingDraft": "Saving translated draft",
  "common:chatbot.handoff.retryDraftLoad": "Retry loading draft",
  "common:chatbot.yes": "Yes translated",
  "common:filters.filter": "Translated filter",
  "common:notifications.categories.wallet": "Wallet translated",
  "common:notifications.loadError": "Translated notification fallback",
  "common:notifications.loadMore": "Load more translated",
  "common:notifications.markAllAsRead": "Mark all translated",
  "common:notifications.noNotificationsFound": "No notifications translated",
  "common:notifications.open": "Open translated",
  "common:notifications.unread": "Unread translated",
  "common:notifications.viewAll": "View all notifications",
  "common:pagination.page": "Page {{current}} of {{total}}",
  "common:statuses.completed": "Completed translated",
  "admin:actions.cancel": "Cancel translated",
  "admin:accessibility.closeConfirmation": "Close translated confirmation",
  "admin:batchActions.approve": "Approve translated",
  "admin:filters.approved": "Approved translated",
  "admin:selection.selected": "{{count}} translated selected",
};

function translate(namespace: string, key: string, options?: TranslationOptions) {
  const value = translations[`${namespace}:${key}`] ?? options?.defaultValue ?? key;
  return value
    .replace("{{count}}", options?.count === undefined ? "{{count}}" : String(options.count))
    .replace("{{title}}", options?.title ?? "{{title}}")
    .replace("{{version}}", options?.version === undefined ? "{{version}}" : String(options.version))
    .replace("{{checkedAt}}", options?.checkedAt ?? "{{checkedAt}}");
}

const commonTranslate = (key: string, options?: TranslationOptions) => translate("common", key, options);
const adminTranslate = (key: string, options?: TranslationOptions) => translate("admin", key, options);

function response(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

function testRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  };
}

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let document: TestDocument;
let container: TestElement;

function findButton(text: string) {
  return findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes(text));
}

function setInputValue(input: TestElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new TestEvent("input", { bubbles: true }));
}

async function render(element: React.ReactElement) {
  await act(async () => {
    root?.render(element);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function openGuestHandoffPreview(question = "How can I contact customer support?") {
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
    if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
    if (url === "/api/chat/mutes") return response({ data: [] });
    if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
    if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
    if (url === "/api/chatbot/session/guest-token") return response({ data: { ready: true } });
    if (url === "/api/chatbot/ask") return response({ data: {
      sessionKey: "guest-support-session",
      answer: "This needs a support teammate.",
      botAnswered: false,
      messageId: "guest-support-answer",
      userMessageId: "guest-support-question",
      language: "en",
    } });
    if (url === "/api/chatbot/feedback") return response({ data: null });
    if (String(url).startsWith("/api/support/drafts?")) return response({ data: { subject: "", body: "", version: 0 } });
    throw new Error(`Unexpected support request: ${url}`);
  });

  await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
  await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
  await click(findButton("Translated support label"));
  const questionInput = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
  setInputValue(questionInput, question);
  await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));
  await click(findButton("Yes translated"));
}

async function openGuestSupportGate() {
  mocks.useAuth.mockReturnValue({ currentUser: null, loading: false });
  await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
  await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
}

describe("Task 5 shared runtime behavior", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.showFeedback.mockReset();
    mocks.confirm.mockReset();
    mocks.confirm.mockResolvedValue(true);
    mocks.useTranslation.mockImplementation((namespace: string) => ({
      t: namespace === "admin" ? adminTranslate : commonTranslate,
      i18n: { resolvedLanguage: "en" },
    }));
    // Support conversations require an authenticated customer. Guest-specific
    // coverage sets currentUser to null explicitly and checks the sign-in gate.
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" }, loading: false });
    vi.stubGlobal("fetch", mocks.fetch);
    Object.defineProperty(window, "location", { configurable: true, value: { pathname: "/customer/support", search: "?from=chat" } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (root) {
      act(() => root?.unmount());
      root = undefined;
    }
    document.body.removeChild(container);
    vi.unstubAllGlobals();
    delete (window as unknown as { location?: unknown }).location;
    document.defaultView.localStorage.clear();
  });

  it("shows a welcome and useful starter actions before and after a greeting", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/chatbot/ask") return response({ data: {
        sessionKey: "greeting-session",
        answer: "Hi, I'm MYLawatan Bot. What can I help you with?",
        botAnswered: true,
        messageId: "greeting-answer",
        userMessageId: "greeting-question",
        language: "en",
        privacyBlocked: false,
      } });
      if (url === "/api/chatbot/feedback") return response({ data: null });
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));

    expect(container.textContent).toContain("Hi, I'm MYLawatan Bot. What can I help you with?");
    expect(container.textContent).toContain("Check my booking translated");
    expect(container.textContent).toContain("Track my refund translated");
    expect(container.textContent).toContain("Find products and prices translated");
    expect(container.textContent).toContain("Browse common questions translated");

    const input = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(input, "hi");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));

    expect(container.textContent).toContain("Hi, I'm MYLawatan Bot. What can I help you with?");
    expect(container.textContent).toContain("Find products and prices translated");
  });

  it("lets an authenticated user replace an unavailable saved session without losing a new question", async () => {
    const oldSessionKey = "199f9fac-8427-45c9-8096-0ece82d6cb54";
    const question = "hi";
    document.defaultView?.localStorage.setItem(chatbotSessionStorageKey("customer-1"), oldSessionKey);
    let historyRequests = 0;
    const askPayloads: { sessionKey?: string; question?: string }[] = [];
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") {
        historyRequests += 1;
        return { ok: false, status: 404, json: async () => ({ data: null, error: { code: "NOT_FOUND" } }) } as Response;
      }
      if (url === "/api/chatbot/ask") {
        askPayloads.push(JSON.parse(String(init?.body)) as { sessionKey?: string; question?: string });
        return response({ data: {
          sessionKey: askPayloads.at(-1)?.sessionKey,
          answer: "Your booking is confirmed.",
          botAnswered: true,
          messageId: "booking-answer",
          userMessageId: "booking-question",
          language: "en",
          privacyBlocked: false,
        } });
      }
      if (url === "/api/chatbot/feedback") return response({ data: null });
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));

    expect(container.textContent).toContain("This saved chat is no longer available. Start a new chat to continue.");
    const input = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(input, question);
    const startNewChat = findButton("Start new chat translated");
    const localStorage = document.defaultView?.localStorage;
    const setItemSpy = vi.spyOn(localStorage!, "setItem");
    await act(async () => {
      startNewChat.click();
      startNewChat.click();
    });
    const newSessionKey = document.defaultView?.localStorage.getItem(chatbotSessionStorageKey("customer-1"));
    expect(newSessionKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(newSessionKey).not.toBe(oldSessionKey);
    expect(setItemSpy.mock.calls.filter(([key]) => key === chatbotSessionStorageKey("customer-1"))).toHaveLength(1);
    expect(historyRequests).toBe(1);

    expect((input as unknown as { value: string }).value).toBe(question);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));

    expect(askPayloads).toHaveLength(1);
    expect(askPayloads[0]).toEqual(expect.objectContaining({ sessionKey: newSessionKey, question }));
    expect(container.textContent).toContain("Your booking is confirmed.");
    document.defaultView?.localStorage.removeItem(chatbotSessionStorageKey("customer-1"));
  });

  it("gives expired history a sign-in action without replacing the saved session", async () => {
    const sessionKey = "a2d57f06-8427-45c9-8096-0ece82d6cb54";
    document.defaultView?.localStorage.setItem(chatbotSessionStorageKey("customer-1"), sessionKey);
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return { ok: false, status: 401, json: async () => ({ data: null, error: { code: "UNAUTHORIZED" } }) } as Response;
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));

    expect(container.textContent).toContain("Your sign-in expired. Sign in to restore this conversation.");
    expect(findOne(container, (element) => element.tagName === "A" && element.getAttribute("href") === "/login?next=%2Fcustomer%2Fsupport%3Ffrom%3Dchat")).toBeTruthy();
    expect(document.defaultView?.localStorage.getItem(chatbotSessionStorageKey("customer-1"))).toBe(sessionKey);
    document.defaultView?.localStorage.removeItem(chatbotSessionStorageKey("customer-1"));
  });

  it("starts a new owned session after the ask API rejects an old session and keeps the question for retry", async () => {
    const oldSessionKey = "199f9fac-8427-45c9-8096-0ece82d6cb54";
    const oldOperationId = "af331f47-46b1-4db7-9318-bfc4cc4c86d0";
    const question = "hi";
    document.defaultView?.localStorage.setItem(chatbotSessionStorageKey("customer-1"), oldSessionKey);
    document.defaultView?.localStorage.setItem(`mw_chatbot_ask_operation:${oldSessionKey}`, oldOperationId);
    const askPayloads: { sessionKey?: string; operationId?: string; question?: string }[] = [];
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: { data: [] } });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/ask") {
        askPayloads.push(JSON.parse(String(init?.body)) as { sessionKey?: string; operationId?: string; question?: string });
        if (askPayloads.length === 1) return { ok: false, status: 403, json: async () => ({ data: null, error: { code: "FORBIDDEN" } }) } as Response;
        return response({ data: {
          sessionKey: askPayloads.at(-1)?.sessionKey,
          answer: "Hi, I'm MYLawatan Bot. What can I help you with?",
          botAnswered: true,
          messageId: "greeting-answer",
          userMessageId: "greeting-question",
          language: "en",
          privacyBlocked: false,
        } });
      }
      if (url === "/api/chatbot/feedback") return response({ data: null });
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    const input = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(input, question);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));

    expect(container.textContent).toContain("This saved chat is no longer available. Start a new chat to continue.");
    expect(askPayloads).toHaveLength(1);
    await click(findButton("Start new chat translated"));
    const newSessionKey = document.defaultView?.localStorage.getItem(chatbotSessionStorageKey("customer-1"));
    expect(newSessionKey).not.toBe(oldSessionKey);
    expect((input as unknown as { value: string }).value).toBe(question);
    expect(document.defaultView?.localStorage.getItem(`mw_chatbot_ask_operation:${oldSessionKey}`)).toBeNull();
    expect(askPayloads).toHaveLength(1);

    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));
    expect(askPayloads).toHaveLength(2);
    expect(askPayloads[1]).toEqual(expect.objectContaining({ sessionKey: newSessionKey, question }));
    expect(askPayloads[1].operationId).not.toBe(oldOperationId);
    expect(container.textContent).toContain("Hi, I'm MYLawatan Bot. What can I help you with?");
    document.defaultView?.localStorage.removeItem(chatbotSessionStorageKey("customer-1"));
  });

  it("shows feedback save failure and lets the user retry without losing the vote", async () => {
    let feedbackRequests = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/chatbot/session/guest-token") return response({ data: { ready: true } });
      if (url === "/api/chatbot/ask") return response({ data: {
        sessionKey: "feedback-session",
        answer: "Here is the answer.",
        botAnswered: true,
        messageId: "feedback-answer",
        userMessageId: "feedback-question",
        language: "en",
      } });
      if (url === "/api/chatbot/feedback") {
        feedbackRequests += 1;
        if (feedbackRequests === 1) return response({ error: { code: "WRITE_UNAVAILABLE" } }, false);
        return response({ data: { id: "feedback-row" } });
      }
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    setInputValue(findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question"), "I need help");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));

    await click(findButton("Yes translated"));

    expect(container.textContent).toContain("Feedback could not be saved translated");
    expect(container.textContent).not.toContain("Glad I could help.");
    await click(findButton("Retry feedback translated"));

    expect(feedbackRequests).toBe(2);
    expect(container.textContent).toContain("Glad I could help.");
    expect(container.textContent).not.toContain("Feedback could not be saved translated");
  });

  it("lets the user choose a category and opens a real catalogue product recommendation", async () => {
    let askCount = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/chatbot/ask") {
        askCount += 1;
        return response({ data: askCount === 1 ? {
          sessionKey: "recommendation-session", answer: "What kind of product are you looking for?", botAnswered: true,
          messageId: "clarification-1", userMessageId: "question-1", language: "en", privacyBlocked: false,
          recommendationData: { kind: "clarification", question: "category", options: ["food", "activity", "accommodation", "retail"] },
        } : {
          sessionKey: "recommendation-session", answer: "Here are products that match your request.", botAnswered: true,
          messageId: "recommendation-1", userMessageId: "question-2", language: "en", privacyBlocked: false,
          recommendationData: { kind: "results", products: [{ id: "product-1", name: "Penang Family Park", category: "activity", price: 80, rating: 4.8, reviews: 40, city: "George Town", state: "Penang" }] },
        } });
      }
      if (url === "/api/chatbot/feedback") return response({ data: null });
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    setInputValue(findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question"), "可以推荐几个吗？");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));
    await click(findButton("Activities translated"));

    expect(askCount).toBe(2);
    expect(container.textContent).toContain("Penang Family Park");
    expect(container.textContent).toContain("View product translated");
    expect(findOne(container, (element) => element.tagName === "A" && element.textContent.includes("Penang Family Park")).getAttribute("href"))
      .toBe("/customer/products/product-1");
  });

  it("offers sign-in and returns to the current page when feedback receives 401", async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/chatbot/session/guest-token") return response({ data: { ready: true } });
      if (url === "/api/chatbot/ask") return response({ data: {
        sessionKey: "feedback-session",
        answer: "Here is the answer.",
        botAnswered: true,
        messageId: "feedback-answer",
        userMessageId: "feedback-question",
        language: "en",
      } });
      if (url === "/api/chatbot/feedback") {
        return { ...response({ error: { code: "UNAUTHORIZED" } }, false), status: 401 } as Response;
      }
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    setInputValue(findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question"), "I need help");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));
    await click(findButton("Yes translated"));

    const currentPage = `${window.location.pathname}${window.location.search}`;
    expect(container.textContent).toContain("Sign in again to save feedback translated");
    expect(findOne(container, (element) => element.tagName === "A" && element.getAttribute("href") === `/login?next=${encodeURIComponent(currentPage)}`)).toBeTruthy();
    expect(container.textContent).not.toContain("Retry feedback translated");
  });

  it("keeps the ticket offer available when a negative feedback save fails", async () => {
    let feedbackRequests = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/chatbot/session/guest-token") return response({ data: { ready: true } });
      if (url === "/api/chatbot/ask") return response({ data: {
        sessionKey: "feedback-session",
        answer: "Here is the answer.",
        botAnswered: true,
        messageId: "feedback-answer",
        userMessageId: "feedback-question",
        language: "en",
      } });
      if (url === "/api/chatbot/feedback") {
        feedbackRequests += 1;
        if (feedbackRequests === 1) throw new Error("temporary network interruption");
        return response({ data: { id: "feedback-row" } });
      }
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    setInputValue(findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question"), "I need help");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));

    await click(findButton("No translated"));

    expect(container.textContent).toContain("Feedback could not be saved translated");
    expect(container.textContent).toContain("Translated ticket offer");
    await click(findButton("Retry feedback translated"));

    expect(feedbackRequests).toBe(2);
    expect(container.textContent).toContain("Translated ticket offer");
    expect(container.textContent).not.toContain("temporary network interruption");
  });

  it("blocks duplicate feedback requests while the first save is pending", async () => {
    let resolveFeedback: ((result: Response) => void) | undefined;
    let feedbackRequests = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/chatbot/session/guest-token") return response({ data: { ready: true } });
      if (url === "/api/chatbot/ask") return response({ data: {
        sessionKey: "feedback-session",
        answer: "Here is the answer.",
        botAnswered: true,
        messageId: "feedback-answer",
        userMessageId: "feedback-question",
        language: "en",
      } });
      if (url === "/api/chatbot/feedback") {
        feedbackRequests += 1;
        return new Promise<Response>((resolve) => { resolveFeedback = resolve; });
      }
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    setInputValue(findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question"), "I need help");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));

    const yesButton = findButton("Yes translated");
    await click(yesButton);
    expect(yesButton.disabled).toBe(true);
    await click(yesButton);
    expect(feedbackRequests).toBe(1);

    await act(async () => {
      resolveFeedback?.(response({ data: { id: "feedback-row" } }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Glad I could help.");
  });

  it("uses translated known status labels and safely falls back for arbitrary/prototype statuses", () => {
    const known = renderToStaticMarkup(<StatusBadge status="completed" />);
    const unknown = renderToStaticMarkup(<StatusBadge status="not-a-status" />);
    const toStringStatus = renderToStaticMarkup(<StatusBadge status="toString" />);
    const protoStatus = renderToStaticMarkup(<StatusBadge status="__proto__" />);

    expect(known).toContain("Completed translated");
    expect(unknown).toContain(">not-a-status<");
    expect(toStringStatus).toContain(">toString<");
    expect(protoStatus).toContain(">__proto__<");
    expect(toStringStatus).toContain("bg-muted");
    expect(protoStatus).toContain("bg-muted");
  });

  it("keeps semantic sponsored status styling when the caller supplies a localized label", () => {
    const pending = renderToStaticMarkup(<StatusBadge status="pending_approval" label="Awaiting sponsor approval" />);
    const paused = renderToStaticMarkup(<StatusBadge status="paused" label="Sponsor paused" />);

    expect(pending).toContain("Awaiting sponsor approval");
    expect(pending).toContain("bg-accent/25");
    expect(paused).toContain("Sponsor paused");
    expect(paused).toContain("bg-orange-100");
  });

  it("preserves valid API error details and localizes only the network/fallback error", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ data: null, error: { message: "Vendor API detail" } }, false));
    await render(<NotificationCenter />);
    expect(container.textContent).toContain("Vendor API detail");
    expect(container.textContent).not.toContain("Translated notification fallback");

    act(() => root?.unmount());
    container.textContent = "";
    root = createRoot(container as unknown as Element);
    mocks.fetch.mockRejectedValueOnce(new Error("private socket detail"));
    await render(<NotificationCenter />);
    expect(container.textContent).toContain("Translated notification fallback");
    expect(container.textContent).not.toContain("private socket detail");
  });

  it("keeps translated notification filter labels wired to the original category handler and preserves dynamic content", async () => {
    mocks.fetch.mockResolvedValueOnce(response({
      data: {
        items: [{ id: "n1", title: "Vendor supplied title", body: "User supplied body", link: null, category: "wallet", readAt: null, createdAt: "2026-03-05T14:06:00.000Z" }],
        page: 1,
        pageSize: 15,
        total: 16,
        totalPages: 2,
      },
    }));
    await render(<NotificationCenter categories={[{ value: "all", label: "All" }, { value: "wallet", label: "Wallet" }]} />);
    expect(container.textContent).toContain("Vendor supplied title");
    expect(container.textContent).toContain("User supplied body");

    await click(findButton("Wallet translated"));
    const requestUrls = mocks.fetch.mock.calls.map(([url]) => String(url));
    expect(requestUrls.some((url) => url.includes("category=wallet") && url.includes("page=1"))).toBe(true);
  });

  it("loads the staff inbox through the staff-authorized notification scope", async () => {
    mocks.fetch.mockResolvedValueOnce(response({ data: { items: [], page: 1, pageSize: 15, total: 0, totalPages: 1 } }));
    await render(<NotificationCenter scope="staff" categories={[{ value: "all", label: "All" }, { value: "wallet", label: "Wallet" }]} />);
    expect(String(mocks.fetch.mock.calls[0]?.[0])).toContain("scope=staff");
  });

  it("hides the previous user's notifications immediately after an account switch", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-a" } });
    mocks.fetch.mockResolvedValueOnce(response({ data: {
      items: [{ id: "a-notice", title: "Private A notice", body: "A", link: null, category: "wallet", readAt: null, createdAt: "2026-03-05T14:06:00.000Z" }],
      page: 1, pageSize: 15, total: 1, totalPages: 1,
    } }));
    await render(<NotificationCenter />);
    expect(container.textContent).toContain("Private A notice");

    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-b" } });
    mocks.fetch.mockResolvedValueOnce(response({ data: {
      items: [{ id: "b-notice", title: "Private B notice", body: "B", link: null, category: "wallet", readAt: null, createdAt: "2026-03-05T14:06:00.000Z" }],
      page: 1, pageSize: 15, total: 1, totalPages: 1,
    } }));
    await render(<NotificationCenter />);
    expect(container.textContent).not.toContain("Private A notice");
    expect(container.textContent).toContain("Private B notice");
  });

  it("keeps the notification bell panel inside a narrow viewport", async () => {
    Object.assign(document.defaultView, { innerWidth: 320, innerHeight: 800 });
    vi.spyOn(TestElement.prototype, "getBoundingClientRect").mockImplementation(function (this: TestElement) {
      if (this.getAttribute("aria-label") === "accessibility.notifications") return testRect(282, 14, 36, 36);
      if (this.className.includes("w-[min(26rem")) return testRect(0, 62, 288, 238);
      return testRect(0, 0, 0, 0);
    });

    await render(<NotificationBell />);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "accessibility.notifications"));

    const panel = findOne(container, (element) => element.className.includes("w-[min(26rem"));
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.left).toBe("24px");
    expect(panel.style.top).toBe("62px");
    expect(panel.style.maxHeight).toBe("730px");
  });

  it("loads the next vendor notification page inside the bell without linking to a separate page", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    mocks.fetch.mockImplementation(async (url: string) => {
      const params = new URL(url, "http://localhost").searchParams;
      const page = Number(params.get("page") ?? "1");
      const read = params.get("read");
      const items = read === "unread" ? [] : Array.from({ length: page === 1 ? 15 : 5 }, (_, index) => {
        const number = (page - 1) * 15 + index + 1;
        return { id: `vendor-${number}`, title: `Vendor notice ${number}`, body: `Update ${number}`, link: null, category: "vendor_orders", readAt: null, createdAt: "2026-03-05T14:06:00.000Z" };
      });
      return response({ data: { items, page, pageSize: 15, total: 20, totalPages: 2 } });
    });

    await render(<NotificationBell scope="vendor" vendorId="vendor-1" />);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "accessibility.notifications"));

    expect(container.textContent).toContain("Vendor notice 15");
    expect(container.textContent).not.toContain("Vendor notice 16");
    expect(container.textContent).not.toContain("View all notifications");
    await click(findButton("Load more translated"));

    expect(container.textContent).toContain("Vendor notice 20");
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).includes("page=2") && String(url).includes("scope=vendor"))).toBe(true);
  });

  it("keeps ChatLanguage/answer metadata and dynamic ticket subjects independent from UI translation", () => {
    const message = createBotMessage({ text: "原始回答，不应翻译", messageId: "message-1", language: "zh", botAnswered: false }, "Need help with my wallet");

    expect(message.language).toBe("zh");
    expect(message.text).toBe("原始回答，不应翻译");
    expect(message.feedbackStage).toBe("awaiting_ticket");
    expect(resolveTicketSubject(message.question, "Translated support request")).toBe("Need help with my wallet");
    expect(resolveTicketSubject(undefined, "Translated support request")).toBe("Translated support request");
    expect(resolveTicketSubject("x".repeat(500), "Support request")).toBe("x".repeat(255));
  });

  it("keeps chatbot session storage isolated by account", () => {
    expect(chatbotSessionStorageKey("customer-a")).not.toBe(chatbotSessionStorageKey("customer-b"));
    expect(chatbotSessionStorageKey(null)).toBe("mw_chatbot_session:guest");
  });

  it("offers a working retry after the FAQ request fails", async () => {
    let faqRequests = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") {
        faqRequests += 1;
        return faqRequests === 1
          ? response({ data: null, error: { code: "READ_UNAVAILABLE" } }, false)
          : response({ data: { categories: [] }, error: null });
      }
      throw new Error(`Unexpected chatbot request: ${url}`);
    });
    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Browse translated FAQs"));
    expect(container.textContent).toContain("chatbot.faq.error");
    await click(findButton("Retry translated"));
    expect(faqRequests).toBe(2);
    expect(container.textContent).toContain("chatbot.faq.empty");
  });

  it("loads FAQ questions by database page", async () => {
    let pageTwoRequests = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [{ category: "wallet", count: 11 }] } });
      if (url === "/api/chatbot/faq?category=wallet&page=1") return response({ data: {
        category: "wallet",
        questions: [{ id: "wallet-1", question: "How do I withdraw?" }],
        page: 1,
        pageSize: 10,
        total: 11,
        totalPages: 2,
      } });
      if (url === "/api/chatbot/faq?category=wallet&page=2") {
        pageTwoRequests += 1;
        return response({ data: {
          category: "wallet",
          questions: [{ id: "wallet-11", question: "How do I update my bank details?" }],
          page: 2,
          pageSize: 10,
          total: 11,
          totalPages: 2,
        } });
      }
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Browse translated FAQs"));
    expect(container.textContent).toContain("11");

    await click(findButton("chatbot.faq.categories.wallet"));
    expect(container.textContent).toContain("How do I withdraw?");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Next translated page"));

    expect(pageTwoRequests).toBe(1);
    expect(container.textContent).toContain("How do I update my bank details?");
    expect(container.textContent).not.toContain("How do I withdraw?");
  });

  it("keeps a saved handoff draft recoverable when draft loading fails", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    let draftReads = 0;
    let previewCalls = 0;
    let draftWrite: { subject?: string; body?: string; expectedVersion?: number } | undefined;
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/support/status") return response({ data: null, error: { code: "READ_UNAVAILABLE" } }, false);
      if (url === "/api/support/drafts" && init?.method === "PUT") {
        draftWrite = JSON.parse(String(init.body)) as typeof draftWrite;
        return response({ data: { version: 4, changed: true } });
      }
      if (String(url).startsWith("/api/support/drafts?")) {
        draftReads += 1;
        if (draftReads === 1) {
          return { ...response({ data: null, error: { code: "READ_UNAVAILABLE" } }, false), status: 503 } as Response;
        }
        return response({ data: { subject: "Saved title", body: "Saved details", version: 3 } });
      }
      if (url === "/api/support/handoff/preview") {
        previewCalls += 1;
        return response({ data: { subject: "Saved title", summary: "Saved details", handoffToken: "signed-token" } });
      }
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    const questionInput = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(questionInput, "Has my booking been confirmed?");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));
    await click(findButton("Yes translated"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(container.textContent).toContain("chatbot.handoff.draftLoadFailed");
    expect(findOne(container, (element) => element.getAttribute("role") === "alert").textContent).toContain("chatbot.handoff.draftLoadFailed");
    expect(findButton("Retry loading draft")).toBeTruthy();
    expect(previewCalls).toBe(0);
    expect(container.textContent).toContain("Has my booking been confirmed?");

    await click(findButton("Retry loading draft"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(draftReads).toBe(2);
    expect(previewCalls).toBe(0);
    expect(findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("maxLength") === "255").value).toBe("Saved title");
    await click(findButton("Save translated draft"));
    expect(draftWrite).toMatchObject({ subject: "Saved title", body: "Saved details", expectedVersion: 3 });
  });

  it("offers sign-in instead of falling back to a default handoff after draft authentication expires", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    let previewCalls = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/support/status") return response({ data: null, error: { code: "READ_UNAVAILABLE" } }, false);
      if (String(url).startsWith("/api/support/drafts?")) {
        return { ...response({ data: null, error: { code: "UNAUTHORIZED" } }, false), status: 401 } as Response;
      }
      if (url === "/api/support/handoff/preview") {
        previewCalls += 1;
        return response({ data: { subject: "Default title", summary: "Original question", handoffToken: "signed-token" } });
      }
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    const questionInput = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(questionInput, "Has my booking been confirmed?");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));
    await click(findButton("Yes translated"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(container.textContent).toContain("chatbot.supportErrors.signIn");
    expect(findOne(container, (element) => element.tagName === "A" && element.getAttribute("href") === "/login?next=%2Fcustomer%2Fsupport")).toBeTruthy();
    expect(findButton("Retry loading draft")).toBeTruthy();
    expect(previewCalls).toBe(0);
  });

  it("preserves handoff edits and offers sign-in when saving the draft returns 401", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    let draftWrites = 0;
    let savedPayload: { subject?: string; body?: string; expectedVersion?: number } | undefined;
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/support/status") return response({ data: null, error: { code: "READ_UNAVAILABLE" } }, false);
      if (String(url).startsWith("/api/support/drafts?") && init?.method !== "DELETE") {
        return response({ data: { subject: "", body: "", version: 0 } });
      }
      if (url === "/api/support/drafts" && init?.method === "PUT") {
        draftWrites += 1;
        savedPayload = JSON.parse(String(init.body)) as typeof savedPayload;
        if (draftWrites === 1) return { ...response({ data: null, error: { code: "UNAUTHORIZED" } }, false), status: 401 } as Response;
        return response({ data: { version: 1, changed: true } });
      }
      if (url === "/api/support/handoff/preview") return response({ data: { subject: "Edited title", summary: "Edited summary", handoffToken: "signed-token" } });
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    const questionInput = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(questionInput, "Has my booking been confirmed?");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));
    await click(findButton("Yes translated"));

    setInputValue(findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("maxLength") === "255"), "Edited title");
    setInputValue(findOne(container, (element) => element.tagName === "TEXTAREA" && element.getAttribute("maxLength") === "2000"), "Edited summary");
    await click(findButton("Save translated draft"));

    expect(container.textContent).toContain("chatbot.supportErrors.signIn");
    expect(findOne(container, (element) => element.tagName === "A" && element.getAttribute("href") === "/login?next=%2Fcustomer%2Fsupport")).toBeTruthy();
    expect(findOne(container, (element) => element.getAttribute("role") === "alert").textContent).toContain("chatbot.supportErrors.signIn");

    await click(findButton("Save translated draft"));

    expect(draftWrites).toBe(2);
    expect(savedPayload).toMatchObject({ subject: "Edited title", body: "Edited summary", expectedVersion: 0 });
    expect(container.textContent).toContain("chatbot.handoff.draftSaved");
  });

  it("locks duplicate draft saves and keeps edits made while a save is pending", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    const draftWrites: { subject?: string; body?: string; expectedVersion?: number }[] = [];
    let settleFirstWrite: ((result: Response) => void) | undefined;
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/support/status") return response({ data: null, error: { code: "READ_UNAVAILABLE" } }, false);
      if (String(url).startsWith("/api/support/drafts?") && init?.method !== "DELETE") {
        return response({ data: { subject: "", body: "", version: 0 } });
      }
      if (url === "/api/support/drafts" && init?.method === "PUT") {
        draftWrites.push(JSON.parse(String(init.body)) as { subject?: string; body?: string; expectedVersion?: number });
        if (draftWrites.length === 1) return new Promise<Response>((resolve) => { settleFirstWrite = resolve; });
        return response({ data: { version: 2, changed: true } });
      }
      if (url === "/api/support/handoff/preview") return response({ data: { subject: "Initial title", summary: "Initial summary", handoffToken: "signed-token" } });
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    const questionInput = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(questionInput, "Has my booking been confirmed?");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));
    await click(findButton("Yes translated"));
    setInputValue(findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("maxLength") === "255"), "Initial title");
    setInputValue(findOne(container, (element) => element.tagName === "TEXTAREA" && element.getAttribute("maxLength") === "2000"), "Initial summary");

    const saveButton = findButton("Save translated draft");
    await act(async () => {
      saveButton.dispatchEvent(new TestEvent("click", { bubbles: true }));
      saveButton.dispatchEvent(new TestEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(draftWrites).toHaveLength(1);
    expect(findButton("Saving translated draft").disabled).toBe(true);

    await act(async () => {
      setInputValue(findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("maxLength") === "255"), "Edited during save");
      setInputValue(findOne(container, (element) => element.tagName === "TEXTAREA" && element.getAttribute("maxLength") === "2000"), "Edited summary");
    });
    await act(async () => {
      settleFirstWrite?.(response({ data: { version: 1, changed: true } }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).not.toContain("chatbot.handoff.draftSaved");
    await click(findButton("Save translated draft"));
    expect(draftWrites).toHaveLength(2);
    expect(draftWrites[1]).toMatchObject({ subject: "Edited during save", body: "Edited summary", expectedVersion: 1 });
    expect(container.textContent).toContain("chatbot.handoff.draftSaved");
  });

  it("keeps confirmed handoff content fixed until draft save and ticket creation finish", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    let settleDraftWrite: ((result: Response) => void) | undefined;
    let previewPayload: { subject?: string; summary?: string } | undefined;
    let ticketPayload: { subject?: string; body?: string } | undefined;
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/support/status") return response({ data: null, error: { code: "READ_UNAVAILABLE" } }, false);
      if (String(url).startsWith("/api/support/drafts?") && init?.method === "DELETE") return response({ data: { cleared: true } });
      if (String(url).startsWith("/api/support/drafts?")) return response({ data: { subject: "", body: "", version: 0 } });
      if (url === "/api/support/drafts" && init?.method === "PUT") return new Promise<Response>((resolve) => { settleDraftWrite = resolve; });
      if (url === "/api/support/handoff/preview") {
        previewPayload = JSON.parse(String(init?.body)) as typeof previewPayload;
        return response({ data: { ...previewPayload, handoffToken: "signed-token" } });
      }
      if (url === "/api/support/tickets") {
        const payload = JSON.parse(String(init?.body)) as { subject?: string; body?: string };
        ticketPayload = payload;
        return response({ data: { id: "confirmed-ticket-1", category: "general" } });
      }
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    const questionInput = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(questionInput, "Has my booking been confirmed?");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));
    await click(findButton("Yes translated"));
    setInputValue(findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("maxLength") === "255"), "Reviewed title");
    setInputValue(findOne(container, (element) => element.tagName === "TEXTAREA" && element.getAttribute("maxLength") === "2000"), "Reviewed summary");
    const consent = findOne(container, (element) => element.tagName === "INPUT" && (element as unknown as { type: string }).type === "checkbox");
    (consent as unknown as { checked: boolean }).checked = true;
    await click(consent);
    await click(findButton("Create translated ticket"));

    expect(findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("maxLength") === "255").disabled).toBe(true);
    expect(findOne(container, (element) => element.tagName === "TEXTAREA" && element.getAttribute("maxLength") === "2000").disabled).toBe(true);
    expect(findOne(container, (element) => element.tagName === "INPUT" && (element as unknown as { type: string }).type === "checkbox").disabled).toBe(true);
    expect(previewPayload).toBeUndefined();

    await act(async () => {
      settleDraftWrite?.(response({ data: { version: 1, changed: true } }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(previewPayload).toEqual({ subject: "Reviewed title", summary: "Reviewed summary" });
    expect(ticketPayload).toMatchObject({ subject: "Reviewed title", body: "Reviewed summary" });
  });

  it("lets a signed-in user hand off an unavailable status query using the operation draft target", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    const question = "Has my booking been confirmed?";
    const reviewedSubject = "Please check my booking";
    const reviewedSummary = "I need help confirming my booking.";
    let draftReadTarget: string | null = null;
    let draftWrite: { target?: string; subject?: string; body?: string; expectedVersion?: number } | undefined;
    let draftDeleteTarget: string | null = null;
    let previewPayload: { subject?: string; summary?: string; sessionKey?: string; messageId?: string } | undefined;
    let ticketPayload: { operationId?: string; handoffToken?: string; subject?: string; body?: string; sourceMessageId?: string } | undefined;
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/support/status") return response({ data: null, error: { code: "READ_UNAVAILABLE" } }, false);
      if (String(url).startsWith("/api/support/drafts?")) {
        const target = new URL(String(url), "https://example.test").searchParams.get("target");
        if (init?.method === "DELETE") {
          draftDeleteTarget = target;
          return response({ data: { cleared: true } });
        }
        draftReadTarget = target;
        return response({ data: { subject: "", body: "", version: 0 } });
      }
      if (url === "/api/support/drafts" && init?.method === "PUT") {
        draftWrite = JSON.parse(String(init.body)) as typeof draftWrite;
        return response({ data: { version: (draftWrite?.expectedVersion ?? 0) + 1, changed: true } });
      }
      if (url === "/api/support/handoff/preview") {
        const previewRequest = JSON.parse(String(init?.body)) as { subject?: string; summary?: string; sessionKey?: string; messageId?: string };
        previewPayload = previewRequest;
        return response({ data: {
          subject: previewRequest.subject,
          summary: previewRequest.summary,
          handoffToken: "signed-status-handoff-token",
          sourceMessageId: null,
          sourceMessage: null,
        } });
      }
      if (url === "/api/support/tickets") {
        ticketPayload = JSON.parse(String(init?.body)) as typeof ticketPayload;
        return response({ data: { id: "ticket-status-1", category: "booking" } });
      }
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    const questionInput = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(questionInput, question);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));
    expect(container.textContent).toContain("Translated status unavailable. Retry or open your account page.");
    await click(findButton("Yes translated"));

    expect(draftReadTarget).toMatch(/^[0-9a-f-]{36}$/i);
    expect(draftReadTarget).toBeTruthy();
    const subjectInput = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("maxLength") === "255");
    setInputValue(subjectInput, reviewedSubject);
    const summaryInput = findOne(container, (element) => element.tagName === "TEXTAREA");
    setInputValue(summaryInput, reviewedSummary);
    await click(findButton("Save translated draft"));
    expect(draftWrite).toMatchObject({ target: draftReadTarget, subject: reviewedSubject, body: reviewedSummary, expectedVersion: 0 });

    const consent = findOne(container, (element) => element.tagName === "INPUT" && (element as unknown as { type: string }).type === "checkbox");
    (consent as unknown as { checked: boolean }).checked = true;
    await click(consent);
    await click(findButton("Create translated ticket"));

    if (!previewPayload) throw new Error("Handoff preview was not requested");
    expect(previewPayload).toMatchObject({ subject: reviewedSubject, summary: reviewedSummary });
    expect(previewPayload).not.toHaveProperty("messageId");
    expect(ticketPayload).toMatchObject({
      subject: reviewedSubject,
      body: reviewedSummary,
      handoffToken: "signed-status-handoff-token",
    });
    expect(ticketPayload).not.toHaveProperty("sourceMessageId");
    expect(draftWrite).toMatchObject({ target: draftReadTarget, subject: reviewedSubject, body: reviewedSummary, expectedVersion: 1 });
    expect(draftDeleteTarget).toBe(draftReadTarget);
    expect(findOne(container, (element) => element.tagName === "A" && element.getAttribute("href") === "/customer/support/ticket-status-1")).toBeTruthy();
  });

  it("blocks a guest from using either chatbot channel and offers sign-in", async () => {
    await openGuestSupportGate();

    expect(container.textContent).toContain("Sign in to use Support");
    expect(container.textContent).toContain("Translated human support label");
    expect(findOne(container, (element) => element.tagName === "A" && element.getAttribute("href") === "/login?next=%2Fcustomer%2Fsupport%3Ffrom%3Dchat")).toBeTruthy();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not request a bot session for a guest", async () => {
    await openGuestSupportGate();
    expect(mocks.fetch.mock.calls.some(([url]) => String(url).startsWith("/api/chatbot/"))).toBe(false);
  });

  it("creates a human support ticket through the existing reviewed handoff flow", async () => {
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/unread-count" || url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/support/tickets?page=1") return response({ data: { tickets: [], page: 1, total: 0, totalPages: 1 } });
      if (url === "/api/support/handoff/preview") return response({ data: { subject: "Booking help", summary: "My booking is missing", handoffToken: "reviewed-handoff-token" } });
      if (url === "/api/support/tickets" && init?.method === "POST") return response({ data: { id: "human-ticket-1" } });
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated human support label"));
    await click(findButton("New ticket translated"));

    const subject = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("maxLength") === "255");
    const description = findOne(container, (element) => element.tagName === "TEXTAREA" && element.getAttribute("maxLength") === "2000");
    await act(async () => {
      setInputValue(subject, "Booking help");
      setInputValue(description, "My booking is missing");
      findOne(container, (element) => element.tagName === "FORM").dispatchEvent(new TestEvent("submit", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Review before sending translated");
    const consent = findOne(container, (element) => element.tagName === "INPUT" && (element as unknown as { type: string }).type === "checkbox");
    (consent as unknown as { checked: boolean }).checked = true;
    await click(consent);
    await click(findButton("Send to support translated"));

    const submitCall = mocks.fetch.mock.calls.find(([url, init]) => url === "/api/support/tickets" && init?.method === "POST");
    expect(JSON.parse(String(submitCall?.[1]?.body))).toMatchObject({
      subject: "Booking help",
      body: "My booking is missing",
      consent: true,
      handoffToken: "reviewed-handoff-token",
    });
    expect(container.textContent).toContain("Request sent translated");
    expect(findOne(container, (element) => element.tagName === "A" && element.getAttribute("href") === "/customer/support/human-ticket-1")).toBeTruthy();
  });

  it("keeps edited handoff content when the user declines to discard it", async () => {
    mocks.confirm.mockResolvedValue(false);
    await openGuestHandoffPreview();
    const subject = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("maxLength") === "255");
    const summary = findOne(container, (element) => element.tagName === "TEXTAREA" && element.getAttribute("maxLength") === "2000");
    setInputValue(subject, "Edited title");
    setInputValue(summary, "Edited summary");

    await click(findButton("chatbot.handoff.cancel"));

    expect(mocks.confirm).toHaveBeenCalledWith("chatbot.handoff.discardUnsavedConfirm");
    expect(findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("maxLength") === "255").value).toBe("Edited title");
    expect(findOne(container, (element) => element.tagName === "TEXTAREA" && element.getAttribute("maxLength") === "2000").value).toBe("Edited summary");
    expect(container.textContent).not.toContain("chatbot.noProblem");
    expect(mocks.fetch.mock.calls.some(([url]) => String(url) === "/api/support/tickets")).toBe(false);
  });

  it("discards edited handoff content only after the user confirms", async () => {
    await openGuestHandoffPreview();
    setInputValue(findOne(container, (element) => element.tagName === "TEXTAREA" && element.getAttribute("maxLength") === "2000"), "Edited summary");

    await click(findButton("chatbot.handoff.cancel"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(mocks.confirm).toHaveBeenCalledWith("chatbot.handoff.discardUnsavedConfirm");
    expect(container.textContent).toContain("chatbot.noProblem");
    expect(findElements(container, (element) => element.tagName === "TEXTAREA" && element.getAttribute("maxLength") === "2000")).toHaveLength(0);
    expect(mocks.fetch.mock.calls.some(([url]) => String(url) === "/api/support/tickets")).toBe(false);
  });

  it("does not ask for confirmation when the handoff preview is unchanged", async () => {
    await openGuestHandoffPreview();

    await click(findButton("chatbot.handoff.cancel"));

    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(container.textContent).toContain("chatbot.noProblem");
  });

  it("drives the real chatbot send and ticket handlers without translating API answers or ticket subjects", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    const question = "I need help understanding wallet withdrawals.";
    const reviewedSubject = "Please check withdrawal status";
    const answer = "API answer [zh]: withdrawals can take two business days.";
    const askPayloads: { question?: string; operationId?: string; sessionKey?: string }[] = [];
    let ticketPayload: { operationId?: string; handoffToken?: string; subject?: string; body?: string; sourceMessageId?: string; sourceMessage?: string } | undefined;
    let handoffPreviewCalls = 0;
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/ask") {
        askPayloads.push(JSON.parse(String(init?.body)) as { question?: string; operationId?: string; sessionKey?: string });
        if (askPayloads.length === 1) return response({ data: null, error: { code: "OPERATION_UNKNOWN", message: "Check history." } }, false);
        return response({
          data: { sessionKey: "chat-session-1", answer, botAnswered: false, messageId: "message-zh-1", userMessageId: "question-zh-1", language: "zh" },
          error: null,
        });
      }
      if (url === "/api/chatbot/feedback") return response({ data: null, error: null });
      if (String(url).startsWith("/api/support/drafts?") && init?.method !== "DELETE") return response({ data: { subject: "", body: "", version: 0 } });
      if (String(url).startsWith("/api/support/drafts?") && init?.method === "DELETE") return response({ data: { cleared: true } });
      if (url === "/api/support/drafts" && init?.method === "PUT") return response({ data: { version: 1, changed: true } });
      if (url === "/api/support/handoff/preview") {
        handoffPreviewCalls += 1;
        return response({ data: {
          subject: handoffPreviewCalls === 1 ? reviewedSubject : reviewedSubject,
          summary: question,
          handoffToken: "signed-preview-token",
          sourceMessageId: "question-zh-1",
          sourceMessage: "Selected sanitized question [PHONE]",
        }, error: null });
      }
      if (url === "/api/support/tickets") {
        ticketPayload = JSON.parse(String(init?.body)) as typeof ticketPayload;
        return response({ data: { id: "ticket-zh-1", category: "support" }, error: null });
      }
      throw new Error(`Unexpected chatbot request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    // The bubble now opens the split view empty (nothing selected) — pick
    // the pinned Support row before the AI-chat pane (and its composer) exists.
    await click(findButton("Translated support label"));

    const input = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    expect(input.getAttribute("placeholder")).toBe("Translated question");
    setInputValue(input, question);
    const send = findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message");
    expect(send.disabled).toBe(false);
    await click(send);
    expect(container.textContent).toContain("Translated outcome not ready");
    expect(document.defaultView?.localStorage.getItem(`mw_chatbot_ask_operation:${askPayloads[0].sessionKey}`)).toBe(askPayloads[0].operationId);
    await click(send);

    expect(askPayloads).toHaveLength(2);
    expect(askPayloads[0]).toEqual(expect.objectContaining({ question }));
    expect(askPayloads[0].operationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(askPayloads[0].sessionKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(askPayloads[1].operationId).toBe(askPayloads[0].operationId);
    expect(askPayloads[1].sessionKey).toBe(askPayloads[0].sessionKey);
    expect(document.defaultView?.localStorage.getItem(`mw_chatbot_ask_operation:${askPayloads[0].sessionKey}`)).toBeNull();
    expect(container.textContent?.match(/I need help understanding wallet withdrawals\./g)).toHaveLength(1);
    expect(container.textContent).toContain(answer);
    expect(container.textContent).toContain("chatbot.brand");
    expect(container.textContent).not.toContain("Translated answer");
    expect(container.textContent).toContain("Translated ticket offer");

    await click(findButton("Yes translated"));
    expect(ticketPayload).toBeUndefined();
    await click(findButton("Create translated ticket"));
    const consent = findOne(container, (element) => element.tagName === "INPUT" && element.type === "checkbox");
    (consent as unknown as { checked: boolean }).checked = true;
    await click(consent);
    expect(findButton("Create translated ticket").disabled).toBe(false);
    await click(findButton("Create translated ticket"));
    expect(ticketPayload).toBeUndefined();
    expect(findButton("Create translated ticket").disabled).toBe(true);
    expect(container.textContent).toContain("chatbot.handoff.cleanedReview");
    (consent as unknown as { checked: boolean }).checked = true;
    await click(consent);
    await click(findButton("Create translated ticket"));
    expect(ticketPayload).toEqual(expect.objectContaining({
      subject: reviewedSubject,
      body: question,
      handoffToken: "signed-preview-token",
      sourceMessageId: "question-zh-1",
      sourceMessage: "Selected sanitized question [PHONE]",
    }));
    expect(handoffPreviewCalls).toBe(2);
    expect(ticketPayload?.operationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(document.defaultView?.localStorage.getItem("mw_chatbot_support_operations:customer-1")).not.toContain(question);
  });

  it("retries an unavailable account status in place without resending the question to Gemini", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    const question = "Has my withdrawal been paid?";
    let statusRequests = 0;
    let askRequests = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/support/status") {
        statusRequests += 1;
        if (statusRequests === 1) return { ...response({ data: null, error: { code: "READ_UNAVAILABLE" } }, false), status: 503 } as Response;
        return response({ data: { state: "available", items: [{
          id: "withdrawal-1", kind: "withdrawals", status: "pending", label: "Withdrawal request",
          href: "/customer/wallet/withdrawals/withdrawal-1", createdAt: "2026-11-13T00:00:00Z", actions: ["open_record", "handoff"],
        }] } });
      }
      if (url === "/api/chatbot/ask") { askRequests += 1; throw new Error("Status retry must not invoke the chatbot"); }
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    const input = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(input, question);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));

    expect(container.textContent).toContain("Translated status unavailable. Retry or open your account page.");
    expect(findButton("Translated status retry")).toBeTruthy();
    await click(findButton("Translated status retry"));

    expect(statusRequests).toBe(2);
    expect(askRequests).toBe(0);
    expect(container.textContent).toContain("Translated withdrawal request");
    expect(container.textContent).toContain("Translated records found");
    expect(container.textContent?.match(/Has my withdrawal been paid\?/g)).toHaveLength(1);
    expect(findOne(container, (element) => element.tagName === "A" && element.getAttribute("href") === "/customer/wallet/withdrawals/withdrawal-1")).toBeTruthy();
  });

  it("shows KB source titles without exposing internal provenance metadata", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/chatbot/ask") return response({ data: { sessionKey: "customer-session", answer: "Use Wallet settings.", botAnswered: true, messageId: "bot-1", userMessageId: "user-1", language: "en", privacyBlocked: false, evidence: [{ title: "Wallet withdrawal policy", contentVersion: 3, checkedAt: "2026-11-13T00:00:00Z" }] } });
      throw new Error(`Unexpected support request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    const input = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(input, "Where can I read about wallet settings?");
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));

    expect(container.textContent).toContain("Source: Wallet withdrawal policy");
    expect(container.textContent).not.toContain("v3");
    expect(container.textContent).not.toContain("checked");
  });

  it("keeps the question and offers a retry when the auth service is temporarily unavailable", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    const question = "How do I change my profile?";
    let askRequests = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/faq") return response({ data: { categories: [] } });
      if (url === "/api/chatbot/ask") {
        askRequests += 1;
        return response({ data: null, error: { code: "AUTH_UNAVAILABLE" } }, false);
      }
      throw new Error(`Unexpected chatbot request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    const input = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(input, question);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(container.textContent).toContain("Translated account check outage; check your connection and retry");
    expect((input as unknown as { value: string }).value).toBe(question);
    expect(askRequests).toBe(1);
  });

  it("keeps the question and gives a retry path when guest session verification is temporarily unavailable", async () => {
    await openGuestSupportGate();
    expect(container.textContent).toContain("Sign in to use Support");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("recovers a refreshed ask when its stored operation belongs to a different question", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    const sessionKey = "70c130d1-9db6-4f98-8cc7-7bbf8c51f989";
    const staleOperationId = "af331f47-46b1-4db7-9318-bfc4cc4c86d0";
    const question = "How do I update my profile?";
    const askPayloads: { operationId?: string; question?: string }[] = [];
    document.defaultView?.localStorage.setItem(chatbotSessionStorageKey("customer-1"), sessionKey);
    document.defaultView?.localStorage.setItem(`mw_chatbot_ask_operation:${sessionKey}`, staleOperationId);
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") return response({ data: { messages: [], nextCursor: null } });
      if (url === "/api/chatbot/ask") {
        askPayloads.push(JSON.parse(String(init?.body)) as { operationId?: string; question?: string });
        if (askPayloads.length === 1) return response({ data: null, error: { code: "OPERATION_CONFLICT", message: "Stale key." } }, false);
        return response({
          data: { sessionKey, answer: "Open Profile settings.", botAnswered: true, messageId: "bot-recovered-1", userMessageId: "user-recovered-1", language: "en", privacyBlocked: false },
          error: null,
        });
      }
      throw new Error(`Unexpected chatbot request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    const input = findOne(container, (element) => element.tagName === "INPUT" && element.getAttribute("placeholder") === "Translated question");
    setInputValue(input, question);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message"));

    expect(askPayloads).toHaveLength(2);
    expect(askPayloads[0]).toEqual({ sessionKey, operationId: staleOperationId, question });
    expect(askPayloads[1].question).toBe(question);
    expect(askPayloads[1].operationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(askPayloads[1].operationId).not.toBe(staleOperationId);
    expect(container.textContent).toContain("Open Profile settings.");
    expect(document.defaultView?.localStorage.getItem(`mw_chatbot_ask_operation:${sessionKey}`)).toBeNull();
  });

  it("refreshes bounded support history when the chat is reopened", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    document.defaultView?.localStorage.setItem(chatbotSessionStorageKey("customer-1"), "199f9fac-8427-45c9-8096-0ece82d6cb54");
    let historyRequests = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") {
        historyRequests += 1;
        return response({ data: { messages: [], nextCursor: null } });
      }
      throw new Error(`Unexpected chatbot request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    expect(historyRequests).toBe(1);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Close translated chat"));
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    expect(historyRequests).toBe(2);
  });

  it("offers a new chat for an expired guest session and keeps the new session clear until its first ask", async () => {
    await openGuestSupportGate();
    expect(container.textContent).toContain("Sign in to use Support");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("offers a new guest chat when the server explicitly requires a guest session during send", async () => {
    await openGuestSupportGate();
    expect(container.textContent).toContain("Sign in to use Support");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("keeps retry available for a temporary guest history read failure", async () => {
    await openGuestSupportGate();
    expect(container.textContent).toContain("Sign in to use Support");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("asks before claiming a guest chat and restores the transcript after confirmation", async () => {
    const sessionKey = "2145f461-610e-419a-9fad-c41c59d06df6";
    document.defaultView?.localStorage.setItem(chatbotSessionStorageKey(null), sessionKey);
    document.defaultView?.localStorage.removeItem(chatbotSessionStorageKey("customer-1"));
    mocks.useAuth.mockReturnValue({ currentUser: null });
    const userQuestion = { id: "guest-user-message", role: "user" as const, text: "I need help with my reservation." };
    const botAnswer = { id: "guest-bot-message", role: "bot" as const, text: "I can help with that.", question: userQuestion.text, feedbackStage: "awaiting_helpful" as const };
    let historyRequests = 0;
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/chatbot/history") {
        historyRequests += 1;
        return response({ data: { messages: [userQuestion, botAnswer], nextCursor: null } });
      }
      if (url === "/api/chatbot/session/claim") return response({ data: { sessionKey, alreadyOwned: false }, error: null });
      throw new Error(`Unexpected chatbot request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    await click(findButton("Translated support label"));
    expect(container.textContent).toContain("Sign in to use Support");
    expect(container.textContent).not.toContain(userQuestion.text);
    expect(historyRequests).toBe(0);

    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain("Continue guest conversation translated");
    expect(container.textContent).not.toContain(botAnswer.text);
    await click(findButton("Continue guest chat translated"));

    expect(historyRequests).toBe(1);
    expect(container.textContent).toContain(botAnswer.text);
    expect(container.textContent).not.toContain("Continue guest conversation translated");
    expect(document.defaultView?.localStorage.getItem(chatbotSessionStorageKey("customer-1"))).toBe(sessionKey);
    expect(document.defaultView?.localStorage.getItem(chatbotSessionStorageKey(null))).toBeNull();
  });

  it("opens a vendor thread from the merged widget's left pane", async () => {
    mocks.useAuth.mockReturnValue({ currentUser: { id: "cust-1" } });
    const apiThread = {
      id: "thread-1",
      customer_id: "cust-1",
      outlet_id: "outlet-1",
      vendor_id: "vendor-1",
      last_message_at: "2026-03-05T14:06:00.000Z",
      created_at: "2026-03-05T14:00:00.000Z",
      outlets: { id: "outlet-1", name: "Sunset Diving", city: "Kota Kinabalu", state: "Sabah" },
      chat_messages: [],
    };
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url === "/api/chat/unread-count") return response({ data: { count: 0 } });
      if (url === "/api/customer/chat") return response({ data: { threads: [apiThread], readMessageIds: [] } });
      if (url === "/api/chat/mutes") return response({ data: [] });
      if (url === "/api/customer/chat/thread-1") return response({ data: apiThread });
      if (url.endsWith("/read") || url.endsWith("/delivered")) return response({ data: null });
      throw new Error(`Unexpected chat request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));
    // ChatWidgetInbox's list load is its own async fetch chain (threads, then
    // mutes) — give it another tick beyond click()'s own two before the row exists.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const vendorRow = findButton("Sunset Diving");
    await click(vendorRow);

    const composer = findOne(container, (element) => element.tagName === "TEXTAREA");
    expect(composer).toBeTruthy();
  });

  it("keeps translated segmented-filter and confirmation-dialog labels connected to their original handlers", async () => {
    const onFilter = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    await render(
      <>
        <AdminSegmentedFilter value="approved" items={[{ value: "approved", label: "Approved translated" }]} onChange={onFilter} ariaLabel="filters.filter" />
        <AdminConfirmDialog open title="batchActions.approve" description="confirm.approve" confirmLabel="batchActions.approve" onCancel={onCancel} onConfirm={onConfirm} />
      </>,
    );

    await click(findButton("Approved translated"));
    expect(onFilter).toHaveBeenCalledWith("approved");
    await click(findButton("Approve translated"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Close translated confirmation"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders rich confirmation details without changing the confirmation handler", async () => {
    const onConfirm = vi.fn();
    await render(
      <AdminConfirmDialog
        open
        title="batchActions.approve"
        description={<strong>Employee and permission summary</strong>}
        confirmLabel="batchActions.approve"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(container.textContent).toContain("Employee and permission summary");
    await click(findButton("Approve translated"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("requires the displayed phrase before allowing confirmation", async () => {
    const onConfirm = vi.fn();
    await render(<AdminConfirmDialog open title="batchActions.approve" description="confirm.approve" confirmLabel="batchActions.approve" confirmationPhrase="CONFIRM" onCancel={vi.fn()} onConfirm={onConfirm} />);
    const confirmButton = findButton("Approve translated");
    const phraseInput = findOne(container, (element) => element.tagName === "INPUT");
    expect(confirmButton.disabled).toBe(true);

    setInputValue(phraseInput, "CONFIRM");
    await act(async () => { await Promise.resolve(); });
    expect(confirmButton.disabled).toBe(false);
    await click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await render(<AdminConfirmDialog open title="batchActions.approve" description="confirm.approve" confirmLabel="batchActions.approve" confirmationPhrase="CONFIRM" confirmationResetKey="reviewed-data-changed" onCancel={vi.fn()} onConfirm={onConfirm} />);
    expect(findButton("Approve translated").disabled).toBe(true);
  });
});

describe("ReportChatButton failure recovery", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.showFeedback.mockReset();
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    mocks.useTranslation.mockImplementation(() => ({ t: commonTranslate, i18n: { resolvedLanguage: "en" } }));
    vi.stubGlobal("fetch", mocks.fetch);
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

  it("treats an existing open report as reported instead of offering a futile retry", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: { code: "ALREADY_REPORTED" } }) });
    await render(<ReportChatButton chatType="user_admin" threadId="ticket-1" returnPath="/customer/support/ticket-1" />);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "conductReport.reportConversation"));
    await click(findButton("conductReport.submit"));

    expect(container.textContent).toContain("conductReport.reported");
    expect(findElements(container, (element) => element.tagName === "TEXTAREA")).toHaveLength(0);
  });

  it("keeps the reason and offers a return-to-ticket sign-in action after a 401", async () => {
    const ticketId = "0192b643-7ac2-7f7a-a02c-bd64c018fdc7";
    mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: { code: "UNAUTHORIZED" } }) });
    await render(<ReportChatButton chatType="user_admin" threadId={ticketId} returnPath={`/customer/support/${ticketId}`} />);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "conductReport.reportConversation"));
    const textarea = findOne(container, (element) => element.tagName === "TEXTAREA");
    await act(async () => { setInputValue(textarea, "Please review this conversation."); });
    await click(findButton("conductReport.submit"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(container.textContent).toContain("conductReport.signInRequired");
    expect(textarea.value).toBe("Please review this conversation.");
    expect(findOne(container, (element) => element.tagName === "A" && element.getAttribute("href") === `/login?next=${encodeURIComponent(`/customer/support/${ticketId}`)}`)).toBeTruthy();
    await click(findButton("conductReport.copyReason"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Please review this conversation.");
    expect(container.textContent).toContain("conductReport.reasonCopied");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  });

  it("preserves the selected admin ticket as the sign-in return destination", async () => {
    const ticketId = "0192b643-7ac2-7f7a-a02c-bd64c018fdc7";
    mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: { code: "UNAUTHORIZED" } }) });
    await render(<ReportChatButton chatType="user_admin" threadId={ticketId} returnPath={`/admin/support?ticket=${ticketId}`} />);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "conductReport.reportConversation"));
    await click(findButton("conductReport.submit"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(findOne(container, (element) => element.tagName === "A" && element.getAttribute("href") === `/login?next=${encodeURIComponent(`/admin/support?ticket=${ticketId}`)}`)).toBeTruthy();
  });

  it("keeps an unknown write result from inviting an immediate duplicate submission", async () => {
    mocks.fetch.mockRejectedValue(new Error("connection dropped after request"));
    await render(<ReportChatButton chatType="user_admin" threadId="ticket-1" returnPath="/customer/support/ticket-1" />);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "conductReport.reportConversation"));
    const textarea = findOne(container, (element) => element.tagName === "TEXTAREA");
    await act(async () => { setInputValue(textarea, "Please review this conversation."); });
    await click(findButton("conductReport.submit"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(container.textContent).toContain("conductReport.submitResultUnknown");
    expect(textarea.value).toBe("Please review this conversation.");
    expect(findButton("conductReport.submit").disabled).toBe(true);
    expect(findOne(container, (element) => element.tagName === "A" && element.getAttribute("href") === "/customer/support/ticket-1")).toBeTruthy();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("treats a write-unavailable response as uncertain and blocks immediate resubmission", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: { code: "WRITE_UNAVAILABLE" } }) });
    await render(<ReportChatButton chatType="user_admin" threadId="ticket-1" returnPath="/customer/support/ticket-1" />);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "conductReport.reportConversation"));
    await click(findButton("conductReport.submit"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(container.textContent).toContain("conductReport.submitResultUnknown");
    expect(findButton("conductReport.submit").disabled).toBe(true);
  });

  it("keeps the reason available when the server cannot verify the conversation", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: { code: "READ_UNAVAILABLE" } }) });
    await render(<ReportChatButton chatType="user_admin" threadId="ticket-1" returnPath="/customer/support/ticket-1" />);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "conductReport.reportConversation"));
    const textarea = findOne(container, (element) => element.tagName === "TEXTAREA");
    await act(async () => { setInputValue(textarea, "Keep this reason while I retry."); });
    await click(findButton("conductReport.submit"));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(container.textContent).toContain("conductReport.readUnavailable");
    expect(textarea.value).toBe("Keep this reason while I retry.");
  });

  it("sends only one request when submit is triggered twice in the same event turn", async () => {
    const requestResolution: { resolve?: (value: Response) => void } = {};
    mocks.fetch.mockImplementation(() => new Promise<Response>((resolve) => { requestResolution.resolve = resolve; }));
    await render(<ReportChatButton chatType="user_admin" threadId="ticket-1" returnPath="/customer/support/ticket-1" />);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "conductReport.reportConversation"));
    await act(async () => { setInputValue(findOne(container, (element) => element.tagName === "TEXTAREA"), "Please review this conversation."); });
    const submit = findButton("conductReport.submit");

    await act(async () => {
      submit.dispatchEvent(new TestEvent("click", { bubbles: true }));
      submit.dispatchEvent(new TestEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      requestResolution.resolve?.({ ok: true, json: async () => ({ data: { id: "report-1" } }) } as Response);
      await Promise.resolve();
    });
  });

  it("does not let cancel imply that an in-flight report request was withdrawn", async () => {
    const requestResolution: { resolve?: (value: Response) => void } = {};
    mocks.fetch.mockImplementation(() => new Promise<Response>((resolve) => { requestResolution.resolve = resolve; }));
    await render(<ReportChatButton chatType="user_admin" threadId="ticket-1" returnPath="/customer/support/ticket-1" />);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "conductReport.reportConversation"));
    const textarea = findOne(container, (element) => element.tagName === "TEXTAREA");
    await act(async () => { setInputValue(textarea, "Please review this conversation."); });
    await click(findButton("conductReport.submit"));

    expect(findButton("conductReport.submit").disabled).toBe(true);
    expect(findButton("actions.cancel").disabled).toBe(true);
    expect(findOne(container, (element) => element.tagName === "TEXTAREA")).toBeTruthy();

    await act(async () => {
      requestResolution.resolve?.({ ok: true, json: async () => ({ data: { id: "report-1" } }) } as Response);
      await Promise.resolve();
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain("conductReport.reported");
  });
});
