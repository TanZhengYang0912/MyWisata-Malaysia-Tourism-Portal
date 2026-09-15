import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";
import type { RecommendationEarnings } from "@/lib/recommendations/earnings";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.stubGlobal("fetch", mocks.fetch);
vi.mock("next/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} /> }));
vi.mock("lucide-react", () => ({ Sparkles: (props: Record<string, unknown>) => <svg {...props} /> }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && "count" in opts ? `${key}:${opts.count}` : key,
  }),
}));

import { RecommendationEarningsPanel } from "@/components/customer/recommendation-earnings-panel";

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;

function payload(overrides: Partial<RecommendationEarnings> = {}): RecommendationEarnings {
  return {
    totals: { pending: 12.5, lifetimeCleared: 18, convertedVendors: 2 },
    commissions: [
      { id: "a", recommendationId: "rec-1", vendorName: "Aunty Lim", type: "bonus", rate: null, amount: 12.5, status: "pending", createdAt: "2026-03-05T00:00:00.000Z", clearsInDays: 5 },
      { id: "b", recommendationId: "rec-2", vendorName: "Nasi Kandar Deen", type: "ongoing", rate: 0.03, amount: 18, status: "confirmed", createdAt: "2026-03-01T00:00:00.000Z", clearsInDays: null },
      { id: "c", recommendationId: null, vendorName: null, type: "ongoing", rate: 0.03, amount: 9.75, status: "reversed", createdAt: "2026-02-20T00:00:00.000Z", clearsInDays: null },
    ],
    ...overrides,
  };
}

async function render(element: React.ReactElement) {
  await act(async () => {
    root?.render(element);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("RecommendationEarningsPanel", () => {
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

  it("renders nothing when there are no commissions", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: payload({ commissions: [], totals: { pending: 0, lifetimeCleared: 0, convertedVendors: 0 } }) }) });
    await render(<RecommendationEarningsPanel />);
    expect(container.textContent).toBe("");
  });

  it("shows the empty note with showEmpty", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: payload({ commissions: [], totals: { pending: 0, lifetimeCleared: 0, convertedVendors: 0 } }) }) });
    await render(<RecommendationEarningsPanel showEmpty />);
    expect(container.textContent).toContain("ui.recommendationEarnings.empty");
  });

  it("renders totals and one row per commission, reversed row struck through", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: payload() }) });
    await render(<RecommendationEarningsPanel />);

    expect(container.textContent).toContain("ui.recommendationEarnings.title");
    expect(container.textContent).toContain("RM12.50");
    expect(container.textContent).toContain("RM18.00");
    expect(container.textContent).toContain("Aunty Lim");
    expect(container.textContent).toContain("Nasi Kandar Deen");
    expect(container.textContent).toContain("ui.recommendationEarnings.clearsInDays:5");
    // reversed row amount is struck through
    const struck = findElements(container, (el) => el.className.includes("line-through"));
    expect(struck).toHaveLength(1);
    expect(struck[0].textContent).toContain("RM9.75");
  });

  it("scopes to a single recommendation when recommendationId is given", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: payload() }) });
    await render(<RecommendationEarningsPanel recommendationId="rec-2" />);
    expect(container.textContent).toContain("Nasi Kandar Deen");
    expect(container.textContent).not.toContain("Aunty Lim");
  });
});
