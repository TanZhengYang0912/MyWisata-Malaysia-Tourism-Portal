import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

type Subscription = { event: string; table: string; filter?: string; handler: () => void };

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  fetch: vi.fn(),
  subscriptions: [] as Subscription[],
}));

vi.mock("@/hooks/use-auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
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
  }),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/layout/portal-sidebar", () => ({ PortalSidebar: () => null }));
vi.mock("@/components/legal/legal-nav", () => ({ legalNavItems: () => [] }));

import VendorSidebar from "../vendor-sidebar";

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let document: TestDocument;
let container: TestElement;

function unreadCountRequests() {
  return mocks.fetch.mock.calls.filter(([url]) => url === "/api/chat/unread-count").length;
}

describe("VendorSidebar unread realtime", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(async () => {
    mocks.subscriptions.length = 0;
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { count: 0 } }) });
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.useAuth.mockReturnValue({
      user: { id: "staff-1", activeVendorId: "vendor-1", vendorName: "Ghee Hiang" },
      isOutletManager: false,
      isVendorOwner: true,
      isEventVendor: false,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    await act(async () => {
      root?.render(<VendorSidebar />);
      await Promise.resolve();
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  it("scopes every database subscription to the active vendor or the signed-in user", () => {
    expect(mocks.subscriptions.length).toBeGreaterThan(0);
    for (const subscription of mocks.subscriptions) {
      expect(subscription.filter).toMatch(/^(vendor_id=eq\.vendor-1|customer_id=eq\.staff-1|user_id=eq\.staff-1)$/);
    }
  });

  it("refreshes the badge when a thread of the active vendor receives a message", async () => {
    const vendorThreads = mocks.subscriptions.find((subscription) => subscription.table === "chat_threads" && subscription.filter === "vendor_id=eq.vendor-1");
    expect(vendorThreads?.event).toBe("UPDATE");
    const before = unreadCountRequests();

    await act(async () => {
      vendorThreads?.handler();
      await Promise.resolve();
    });

    expect(unreadCountRequests()).toBe(before + 1);
  });

  it("refreshes the badge when the user's own customer thread receives a message", async () => {
    const ownThreads = mocks.subscriptions.find((subscription) => subscription.table === "chat_threads" && subscription.filter === "customer_id=eq.staff-1");
    expect(ownThreads?.event).toBe("UPDATE");
    const before = unreadCountRequests();

    await act(async () => {
      ownThreads?.handler();
      await Promise.resolve();
    });

    expect(unreadCountRequests()).toBe(before + 1);
  });
});
