import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
import type { VendorSettlements } from "@/lib/vendor/settlement";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.stubGlobal("fetch", mocks.fetch);
vi.mock("lucide-react", () => ({ Receipt: (p: Record<string, unknown>) => <svg {...p} /> }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts && "count" in opts ? `${key}:${opts.count}` : key),
  }),
}));

import { VendorSettlementPanel } from "@/components/vendor/vendor-settlement-panel";

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;

function payload(over: Partial<VendorSettlements> = {}): VendorSettlements {
  return {
    totals: { pendingSen: 8500, clearedSen: 4000, lifetimePlatformFeesSen: 3000 },
    settlements: [
      { id: "a", orderId: "o1", orderDisplayId: "MW-1", grossSen: 10000, platformFeeSen: 1500, vendorNetSen: 8500, platformRate: 0.15, status: "pending", clearsInDays: 5, createdAt: "2026-03-05T00:00:00.000Z" },
      { id: "b", orderId: "o2", orderDisplayId: "MW-2", grossSen: 5000, platformFeeSen: 750, vendorNetSen: 4250, platformRate: 0.15, status: "reversed", clearsInDays: null, createdAt: "2026-03-01T00:00:00.000Z" },
    ],
    ...over,
  };
}

async function render(el: React.ReactElement) {
  await act(async () => {
    root?.render(el);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("VendorSettlementPanel", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });
  beforeEach(() => {
    mocks.fetch.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });
  afterEach(() => {
    if (root) { act(() => root?.unmount()); root = undefined; }
    document.body.removeChild(container);
  });

  it("renders nothing when there are no settlements", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: payload({ settlements: [] }) }) });
    await render(<VendorSettlementPanel />);
    expect(container.textContent).toBe("");
  });

  it("renders totals and one row per settlement, reversed row struck through", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: payload() }) });
    await render(<VendorSettlementPanel />);

    expect(container.textContent).toContain("ui.settlement.title");
    expect(container.textContent).toContain("RM85.00"); // pending total
    expect(container.textContent).toContain("MW-1");
    expect(container.textContent).toContain("ui.settlement.clearsInDays:5");
    const struck = findElements(container, (el) => el.className.includes("line-through"));
    expect(struck).toHaveLength(1);
    expect(struck[0].textContent).toContain("RM42.50");
  });
});
