import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  currentUser: { id: "creator-1" } as { id: string } | null,
}));

vi.mock("react-i18next", () => {
  const t = (key: string) => key === "promotionCampaigns.form.vendorWide" ? "All eligible outlets" : key;
  return {
    useTranslation: () => ({ t, i18n: { resolvedLanguage: "en" } }),
  };
});
vi.mock("@/components/providers/app-dialog", () => ({ useAppDialog: () => ({ confirm: vi.fn(), prompt: vi.fn() }) }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: mocks.currentUser }) }));

import PromotionCampaignsPage from "@/app/admin/promotion-campaigns/page";

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot>;

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function campaignPayload(status: "draft" | "pending_approval" = "draft") {
  return response({ data: {
    campaigns: [{
      id: "campaign-1", slug: "heritage-walk-kl-current-offers", title: "Heritage Walk KL — Local Explorer Picks",
      summary: "Offers from Heritage Walk KL", description: "Existing outlet products and voucher.", status,
      starts_at: "2026-09-25T10:50:00.000Z", ends_at: "2027-03-12T23:00:00.000Z",
      created_by: "creator-1", updated_at: "2026-09-25T11:28:22.000Z", rejection_note: null,
      offers: [
        { id: "offer-product", product_id: "product-1", outlet_id: "outlet-1", voucher_id: null, position: 0 },
        { id: "offer-voucher", product_id: null, outlet_id: null, voucher_id: "voucher-1", position: 1 },
      ],
    }],
    sources: {
      products: [{ productId: "product-1", productName: "Chicken Rice Set", productType: "food", vendorId: "vendor-1", vendorName: "Heritage Walk KL", outletId: "outlet-1", outletName: "Heritage Walk KL Main Outlet", city: "Kuala Lumpur", state: "Kuala Lumpur", price: 110.88, imageUrl: null }],
      vouchers: [{ voucherId: "voucher-1", name: "Local explorer welcome offer", voucherType: "percent", discountValue: 10, vendorId: "vendor-1", vendorName: "Heritage Walk KL", outletId: null, outletName: null, claimFrom: null, claimUntil: null, validFrom: "2026-08-14T00:00:00.000Z", validUntil: "2027-03-12T23:00:00.000Z", maxUses: 500, usesCount: 5 }],
    },
  }, error: null });
}

async function click(element: TestElement) {
  await act(async () => {
    element.dispatchEvent(new TestEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function selectValue(element: TestElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new TestEvent("change", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("Admin promotion campaign workbench", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    mocks.currentUser = { id: "creator-1" };
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockReset().mockResolvedValue(campaignPayload());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.removeChild(container);
    vi.unstubAllGlobals();
  });

  it("renders a localized loading state while staff campaigns and eligible sources load", () => {
    const markup = renderToStaticMarkup(<PromotionCampaignsPage />);

    expect(markup).toContain("promotionCampaigns.title");
    expect(markup).toContain('role="status"');
    expect(markup).toContain("promotionCampaigns.states.loading");
    expect(markup).not.toContain("promotionCampaigns.form.saveDraft");
  });

  it("does not offer self-review actions to the campaign creator", async () => {
    mocks.fetch.mockResolvedValue(campaignPayload("pending_approval"));

    await act(async () => {
      root.render(<PromotionCampaignsPage />);
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("promotionCampaigns.status.pending_approval");
    expect(container.textContent).not.toContain("promotionCampaigns.actions.approve");
    expect(container.textContent).not.toContain("promotionCampaigns.actions.reject");
  });

  it("keeps review actions available to an independent campaign reviewer", async () => {
    mocks.currentUser = { id: "reviewer-2" };
    mocks.fetch.mockResolvedValue(campaignPayload("pending_approval"));

    await act(async () => {
      root.render(<PromotionCampaignsPage />);
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("promotionCampaigns.actions.approve");
    expect(container.textContent).toContain("promotionCampaigns.actions.reject");
  });

  it("keeps every selected offer labeled when switching the source type", async () => {
    await act(async () => {
      root.render(<PromotionCampaignsPage />);
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain("Heritage Walk KL — Local Explorer Picks");

    const editDraft = findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("promotionCampaigns.actions.edit"));
    await click(editDraft);

    expect(container.textContent).toContain("Heritage Walk KL · Chicken Rice Set · Heritage Walk KL Main Outlet, Kuala Lumpur · RM110.88");
    expect(container.textContent).toContain("Heritage Walk KL · Local explorer welcome offer · All eligible outlets");
    expect(container.textContent).not.toContain("promotionCampaigns.form.unavailableVoucher");

    const offerType = findOne(container, (element) => element.tagName === "SELECT" && element.getAttribute("aria-label") === "promotionCampaigns.form.offerType");
    await selectValue(offerType, "voucher");

    expect(container.textContent).toContain("Heritage Walk KL · Chicken Rice Set · Heritage Walk KL Main Outlet, Kuala Lumpur · RM110.88");
    expect(container.textContent).toContain("Heritage Walk KL · Local explorer welcome offer · All eligible outlets");
    expect(container.textContent).not.toContain("promotionCampaigns.form.unavailableProduct");
  });
});
