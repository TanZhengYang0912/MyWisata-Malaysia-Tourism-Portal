import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

type Subscription = { event: string; table: string; filter?: string; handler: () => void };

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  fetch: vi.fn(),
  subscriptions: [] as Subscription[],
}));

vi.mock("@/components/providers/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/backend/supabase", () => ({
  supabase: {
    channel: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channel: any = {
        on: (_type: string, config: Omit<Subscription, "handler">, handler: () => void) => {
          mocks.subscriptions.push({ ...config, handler });
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: () => undefined,
  },
}));

import { SupportChatProvider } from "@/components/providers/support-chat";

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let document: TestDocument;
let container: TestElement;

function unreadCountRequests() {
  return mocks.fetch.mock.calls.filter(([url]) => url === "/api/chat/unread-count").length;
}

describe("SupportChatProvider unread realtime", () => {
  beforeAll(async () => {
    document = installTestDom();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    mocks.subscriptions.length = 0;
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { count: 0 } }) });
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.useAuth.mockReturnValue({ currentUser: { id: "customer-1" } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    await act(async () => {
      root?.render(<SupportChatProvider>{null}</SupportChatProvider>);
      await Promise.resolve();
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("scopes every database subscription to the signed-in customer", () => {
    expect(mocks.subscriptions.length).toBeGreaterThan(0);
    for (const subscription of mocks.subscriptions) {
      expect(subscription.filter).toMatch(/^(customer_id|user_id)=eq\.customer-1$/);
    }
  });

  it("refreshes the badge when one of the customer's threads receives a message", async () => {
    const threadUpdates = mocks.subscriptions.find((subscription) => subscription.table === "chat_threads");
    expect(threadUpdates).toMatchObject({ event: "UPDATE", filter: "customer_id=eq.customer-1" });
    const before = unreadCountRequests();

    await act(async () => {
      threadUpdates?.handler();
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(unreadCountRequests()).toBe(before + 1);
  });
});
