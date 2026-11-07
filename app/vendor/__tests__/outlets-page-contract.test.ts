import React, { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, installTestDom, type TestDocument, TestElement } from "@/components/shared/__tests__/render-test-dom";

vi.mock("react-i18next", () => {
  const t = (key: string) => key;
  const i18n = { language: "en", resolvedLanguage: "en" };
  const exists = () => false;
  return { useTranslation: () => ({ t, i18n, exists }) };
});
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => React.createElement("a", { href, ...props }, children),
}));
vi.mock("@/components/outlet/outlet-menu", () => ({ OutletMenu: () => null }));
vi.mock("@/components/outlet/hotel-page", () => ({ HotelPage: () => null }));

import OutletShopPreview from "@/components/vendor/outlet-shop-preview";
import { createDefaultOutletPageDocument } from "@/lib/vendor/outlet-page-schema";

const source = readFileSync(resolve(process.cwd(), "app/vendor/outlets/page.tsx"), "utf8");
const previewSource = readFileSync(resolve(process.cwd(), "components/vendor/outlet-shop-preview.tsx"), "utf8");
const actionSource = readFileSync(resolve(process.cwd(), "components/vendor/outlet-action-group.tsx"), "utf8");
const formSource = readFileSync(resolve(process.cwd(), "components/vendor/outlet-form.tsx"), "utf8");

let testDocument: TestDocument;
let createRoot: typeof import("react-dom/client").createRoot;
let container: TestElement;
let root: ReturnType<typeof createRoot>;

beforeAll(async () => {
  testDocument = installTestDom();
  ({ createRoot } = await import("react-dom/client"));
});

beforeEach(() => {
  container = testDocument.createElement("div");
  testDocument.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});

afterEach(() => {
  act(() => root.unmount());
  testDocument.body.removeChild(container);
  vi.unstubAllGlobals();
});

async function renderShopPreview(isPublished: boolean) {
  const pageDocument = { ...createDefaultOutletPageDocument("Baba House"), blocks: [] };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const data = url.endsWith("/page")
      ? { isPublished, published: pageDocument, draft: pageDocument, publishedAt: isPublished ? "2026-10-01T00:00:00.000Z" : null }
      : { items: [], pagination: { totalPages: 1 } };
    return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));

  await act(async () => {
    root.render(React.createElement(OutletShopPreview, {
      vendorId: "vendor-1",
      outlet: { id: "outlet-1", name: "Baba House", address: "Jonker Street", city: "Melaka", state: "Melaka" },
      onEdit: () => undefined,
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return findElements(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("shopPreview.editShopPage"))[0];
}

describe("vendor outlets management affordances", () => {
  it("keeps preview status and primary edit action available on phones", async () => {
    const editButton = await renderShopPreview(false);

    expect(container.textContent).toContain("shopPreview.previewOnly");
    expect(container.textContent).toContain("shopPreview.customerPreview");
    expect(editButton?.getAttribute("class")).toContain("order-first");
    expect(editButton?.getAttribute("class")).toContain("w-full");
  });

  it("shows the public shop link only after the shop is published", async () => {
    await renderShopPreview(false);
    expect(findElements(container, (element) => element.tagName === "A" && element.textContent.includes("shopPreview.viewPublicShop"))).toHaveLength(0);

    await act(async () => root.unmount());
    root = createRoot(container as unknown as Element);
    await renderShopPreview(true);
    expect(findElements(container, (element) => element.tagName === "A" && element.textContent.includes("shopPreview.viewPublicShop"))).toHaveLength(1);
  });

  it("keeps voucher creation out of the outlet shop preview", async () => {
    await renderShopPreview(false);

    expect(container.textContent).not.toContain("ui.outlets.createVoucher");
  });

  it("keeps page selection in the result summary row", () => {
    expect(source).toContain("aria-label={t('ui.outlets.selectCurrentPage')}");
    expect(source).toContain("t('ui.outlets.selectCurrentPage')");
    expect(source).not.toContain("Select current page");
  });

  it("makes outlet actions and empty listing states explicit", () => {
    expect(source).toContain("t('ui.outlets.viewDetails')");
    expect(source).toContain("t('ui.outlets.editOutlet')");
    expect(source).toContain("t('ui.outlets.noListings')");
    expect(source).not.toContain("ui.outlets.createVoucher");
    expect(source).not.toContain("id: 'create-voucher'");
    expect(previewSource).not.toContain("ui.outlets.createVoucher");
    expect(previewSource).not.toContain("onCreateVoucher");
  });

  it("only renders pagination when there is more than one page", () => {
    expect(source).toContain("pagination.totalPages > 1");
  });

  it("centers outlet details as a modal instead of a right-side drawer", () => {
    expect(source).toContain(
      "import CenteredDetailModal from '@/components/ui/centered-detail-modal';",
    );
    expect(source).not.toContain("absolute right-0 top-0");
    expect(source).not.toContain("<style jsx global>");
  });

  it("uses the reusable outlet action group for card and modal actions", () => {
    expect(source).toContain("import OutletActionGroup from '@/components/vendor/outlet-action-group';");
    expect(source).toContain("<OutletActionGroup");
    expect(source).toContain("variant: 'primary'");
    expect(source).toContain("variant: 'secondary'");
    expect(source).toContain("variant: 'destructive'");
    expect(actionSource).toContain("export type OutletAction");
    expect(actionSource).toContain("variant: 'primary' | 'secondary' | 'tertiary' | 'destructive'");
    expect(actionSource).toContain("aria-label={ariaLabel}");
  });

  it("uses the custom confirmation dialog for closing an outlet", () => {
    expect(source).toContain("import ActionConfirmationDialog from '@/components/vendor/action-confirmation-dialog';");
    expect(source).toContain("pendingCloseOutlet");
    expect(source).toContain("<ActionConfirmationDialog");
    expect(source).not.toContain("confirm(t('ui.outlets.closeConfirm'))");
    expect(source).not.toContain("window.confirm");
  });

  it("only exposes shop page editing to outlet managers", () => {
    expect(source).toContain("id: 'edit-shop-page'");
    expect(source).toContain(": isOutletManager");
    expect(source).toContain("builderOutlet && vendorId && isOutletManager");
    expect(source).toContain("id: 'edit-outlet'");
  });

  it("uses precise outlet detail labels and separates the destructive action", () => {
    expect(source).toContain("t('ui.outlets.closeOutlet')");
    expect(source).toContain("t('ui.outlets.getDirections')");
    expect(source).toContain("t('ui.outlets.listedProducts')");
    expect(source).toContain("t('ui.outlets.contactDetails')");
    expect(actionSource).toContain("layout === 'detail' && variant === 'destructive' ? 'sm:col-span-2' : ''");
  });

  it("keeps the long outlet form scrollable with grouped sections and reachable actions", () => {
    expect(formSource).toContain("data-outlet-form-scroll-region");
    expect(formSource).toContain("data-outlet-form-actions");
    expect(formSource).toContain("outletForm.sections.businessDetails");
    expect(formSource).toContain("outletForm.sections.contactAndMap");
    expect(formSource).toContain("outletForm.sections.visitorOptions");
    expect(formSource).toContain("outletForm.sections.outletCategories");
    expect(formSource).toContain("outletForm.sections.welcomeMessage");
    expect(formSource).toContain("sticky bottom-0");
  });
});
