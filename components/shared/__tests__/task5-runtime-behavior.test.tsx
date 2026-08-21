import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TestEvent, findOne, installTestDom, type TestDocument, type TestElement } from "./render-test-dom";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  useTranslation: vi.fn(),
}));

vi.mock("react-i18next", () => ({ useTranslation: mocks.useTranslation }));
vi.mock("next/link", () => ({ default: (props: { children?: React.ReactNode }) => <a {...props} /> }));
vi.mock("lucide-react", () => {
  const Icon = (props: Record<string, unknown>) => <svg {...props} />;
  // Mic/MicOff (voice input) and ChevronLeft/HelpCircle (FAQ shortcuts) are
  // also reachable from ChatbotWidget — the mock must cover every icon the
  // component can render, not only the ones it rendered when this was written.
  return {
    AlertTriangle: Icon, Bell: Icon, CheckCheck: Icon, ChevronLeft: Icon, HelpCircle: Icon,
    MessageCircle: Icon, Mic: Icon, MicOff: Icon, Send: Icon, X: Icon,
  };
});
vi.mock("@/components/ui/button", () => ({ Button: (props: React.ComponentProps<"button">) => <button {...props} /> }));
vi.mock("@/components/utils", () => ({ cn: (...values: unknown[]) => values.filter(Boolean).join(" ") }));

import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { AdminSegmentedFilter } from "@/components/admin/segmented-filter";
import { ChatbotWidget, createBotMessage, resolveTicketSubject } from "@/components/shared/chatbot-widget";
import { NotificationCenter } from "@/components/shared/notification-center";
import { StatusBadge } from "@/components/shared/status-badge";
import { SupportChatProvider } from "@/components/providers/support-chat";

type TranslationOptions = { defaultValue?: string; count?: number };

const translations: Record<string, string> = {
  "common:accessibility.closeConfirmation": "Close translated confirmation",
  "common:accessibility.openChat": "Open translated chat",
  "common:chatbot.closeChat": "Close translated chat",
  "common:chatbot.emptyPrompt": "Ask a translated question",
  "common:chatbot.inputPlaceholder": "Translated question",
  "common:chatbot.myTickets": "Translated my tickets",
  "common:chatbot.no": "No translated",
  "common:chatbot.send": "Send translated message",
  "common:chatbot.somethingWrong": "Translated network fallback",
  "common:chatbot.title": "Translated support title",
  "common:chatbot.wantTicket": "Translated ticket offer",
  "common:chatbot.yes": "Yes translated",
  "common:filters.filter": "Translated filter",
  "common:notifications.categories.wallet": "Wallet translated",
  "common:notifications.loadError": "Translated notification fallback",
  "common:notifications.markAllAsRead": "Mark all translated",
  "common:notifications.noNotificationsFound": "No notifications translated",
  "common:notifications.open": "Open translated",
  "common:notifications.unread": "Unread translated",
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
  return options?.count === undefined ? value : value.replace("{{count}}", String(options.count));
}

const commonTranslate = (key: string, options?: TranslationOptions) => translate("common", key, options);
const adminTranslate = (key: string, options?: TranslationOptions) => translate("admin", key, options);

function response(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
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

describe("Task 5 shared runtime behavior", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.useTranslation.mockImplementation((namespace: string) => ({
      t: namespace === "admin" ? adminTranslate : commonTranslate,
      i18n: { resolvedLanguage: "en" },
    }));
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

  it("keeps ChatLanguage/answer metadata and dynamic ticket subjects independent from UI translation", () => {
    const message = createBotMessage({ text: "原始回答，不应翻译", messageId: "message-1", language: "zh", botAnswered: false }, "Need help with my wallet");

    expect(message.language).toBe("zh");
    expect(message.text).toBe("原始回答，不应翻译");
    expect(message.feedbackStage).toBe("awaiting_ticket");
    expect(resolveTicketSubject(message.question, "Translated support request")).toBe("Need help with my wallet");
    expect(resolveTicketSubject(undefined, "Translated support request")).toBe("Translated support request");
  });

  it("drives the real chatbot send and ticket handlers without translating API answers or ticket subjects", async () => {
    const question = "Why is my wallet withdrawal still pending?";
    const answer = "API answer [zh]: withdrawals can take two business days.";
    let askPayload: { question?: string } | undefined;
    let ticketPayload: { sessionKey?: string; subject?: string; body?: string } | undefined;
    mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/chatbot/ask") {
        askPayload = JSON.parse(String(init?.body)) as { question?: string };
        return response({
          data: { sessionKey: "chat-session-1", answer, botAnswered: false, messageId: "message-zh-1", language: "zh" },
          error: null,
        });
      }
      if (url === "/api/chatbot/feedback") return response({ data: null, error: null });
      if (url === "/api/support/tickets") {
        ticketPayload = JSON.parse(String(init?.body)) as { sessionKey?: string; subject?: string; body?: string };
        return response({ data: { id: "ticket-zh-1", category: "support" }, error: null });
      }
      throw new Error(`Unexpected chatbot request: ${url}`);
    });

    await render(<SupportChatProvider><ChatbotWidget /></SupportChatProvider>);
    await click(findOne(container, (element) => element.getAttribute("aria-label") === "Open translated chat"));

    const input = findOne(container, (element) => element.tagName === "INPUT");
    expect(input.getAttribute("placeholder")).toBe("Translated question");
    setInputValue(input, question);
    const send = findOne(container, (element) => element.getAttribute("aria-label") === "Send translated message");
    expect(send.disabled).toBe(false);
    await click(send);

    expect(askPayload).toEqual({ question });
    expect(container.textContent).toContain(answer);
    expect(container.textContent).toContain("Translated support title");
    expect(container.textContent).not.toContain("Translated answer");
    expect(container.textContent).toContain("Translated ticket offer");

    await click(findButton("Yes translated"));
    expect(ticketPayload).toEqual({ sessionKey: "chat-session-1", subject: question, body: question });
  });

  it("keeps translated segmented-filter and confirmation-dialog labels connected to their original handlers", async () => {
    const onFilter = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    await render(
      <>
        <AdminSegmentedFilter value="approved" items={[{ value: "approved", label: "Approved" }]} onChange={onFilter} ariaLabel="filters.filter" />
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
});
