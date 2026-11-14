import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

type Subscription = { event: string; table: string; filter?: string; handler: () => void };

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  subscriptions: [] as Subscription[],
  visibility: "visible" as "visible" | "hidden",
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
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

import DashboardRealtime from "@/components/vendor/dashboard-realtime";

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let document: TestDocument;
let container: TestElement;

describe("DashboardRealtime", () => {
  beforeAll(async () => {
    document = installTestDom();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => mocks.visibility });
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    mocks.refresh.mockReset();
    mocks.subscriptions.length = 0;
    mocks.visibility = "visible";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
    await act(async () => {
      root?.render(<DashboardRealtime vendorId="vendor-1" />);
      // The Supabase client is imported lazily; let that import settle.
      await vi.dynamicImportSettled();
      await Promise.resolve();
    });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  it("subscribes only to rows scoped to the vendor", () => {
    expect(mocks.subscriptions.length).toBeGreaterThan(0);
    for (const subscription of mocks.subscriptions) {
      expect(subscription.filter).toBe("vendor_id=eq.vendor-1");
    }
  });

  it("refreshes once for a burst of changes from one order", async () => {
    const orderItems = mocks.subscriptions.find((subscription) => subscription.table === "order_items");
    expect(orderItems).toBeDefined();

    await act(async () => {
      orderItems?.handler();
      orderItems?.handler();
      orderItems?.handler();
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("skips the fallback refresh while the tab is hidden", async () => {
    mocks.visibility = "hidden";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mocks.refresh).not.toHaveBeenCalled();

    mocks.visibility = "visible";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
});
