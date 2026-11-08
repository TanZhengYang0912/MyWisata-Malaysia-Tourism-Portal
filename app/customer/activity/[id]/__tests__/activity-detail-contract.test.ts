import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/customer/activity/[id]/activity-detail-client.tsx"), "utf8");
const pageSource = readFileSync(resolve(process.cwd(), "app/customer/activity/[id]/page.tsx"), "utf8");

describe("activity add-to-cart error handling", () => {
  it("awaits the cart write and handles persistence failures in the UI", () => {
    expect(source).toContain("await addItem");
    expect(source).toContain("catch (error)");
    expect(source).toContain('t("ui.activity.cartError"');
  });
});

describe("place-bound activity presentation", () => {
  it("uses place-first copy while retaining vendor copy for ordinary activities", () => {
    expect(source).toContain('t("ui.labels.placeBasedExperience"');
    expect(source).toContain('t("ui.labels.providedBy"');
    expect(source).toContain("isPlaceBound");
    expect(source).toContain("getActivityCommerceMode");
    expect(source).toContain('t("ui.activity.noVendorBooking")');
    expect(source).toContain('t("ui.labels.freeToExplore")');
  });
});

describe("vendor-to-outlet commerce boundary", () => {
  it("never blocks purchase behind a separate outlet-selection step", () => {
    expect(source).toContain('const vendorDiscovery = searchParams.get("source") === "vendor";');
    expect(source).toContain("getEffectiveOutletCount");
    expect(source).not.toContain("shouldRequireOutletSelection");
    expect(source).not.toContain("outletSelectionRequired");
    expect(source).not.toContain('t("ui.activity.chooseOutletContinue")');
    expect(source).not.toContain('t("ui.labels.priceAvailability")');
    expect(source).toContain("outletChoices.map");
    expect(source).toContain("{!publicPlace && <div className=\"fixed inset-x-0 bottom-0");
  });

  it("shows each outlet choice's live open status, falling back to the server's closed flag", () => {
    expect(source).toContain("const outletStatus = useOutletOpenStatus();");
    expect(source.match(/<OutletChoiceStatus choice=\{choice\} status=\{outletStatus\} \/>/g)).toHaveLength(1);
    expect(source).not.toContain('{!choice.open && ` · ${t("ui.labels.currentlyClosed")}`}');
  });

  it("preserves an outlet selected by an outlet-originated detail link", () => {
    expect(source).toContain('const requestedOutletId = searchParams.get("outletId");');
    expect(source).toContain("outletChoices.some((choice) => choice.outletId === requestedOutletId)");
  });

  it("reloads server-backed detail data when the customer changes outlet", () => {
    expect(source).toContain("router.replace(buildActivityPath(");
    expect(source).toContain("choice.outletId");
    expect(pageSource).toContain("requestedOutletId");
    expect(pageSource).toContain('key={`${activity?.id ?? id}:${selectedOutletId ?? ""}`}');
  });

  it("keeps slots and stock tied to the exact selected outlet", () => {
    expect(source).toContain("slot.outletId === outletId");
    expect(source).toContain("getSelectedOutletStock(activity, outletId)");
    expect(source).not.toContain("slot.outletId || slot.outletId === outletId");
  });

  it("keeps related products scoped to the selected outlet, each card pinned to its own outlet offer", () => {
    expect(source).toContain('ui.activity.moreFromOutlet');
    expect(source).toContain("selectedOutlet");
    expect(source).toContain("<ProductCard");
    expect(source).toContain("listing={toOutletCatalogueCard(product)}");
    expect(source).not.toContain("outletId={selectedOutlet.outletId}");
  });

  it("shows operating hours for the selected outlet", () => {
    expect(source).toContain("selectedOutlet!.hours");
    expect(source).toContain('t("ui.labels.operatingHours")');
  });
});

describe("related vendor section", () => {
  it("uses one vendor heading and keeps the vendor link and related product cards", () => {
    expect(source).not.toContain('t("ui.activity.moreFromVendorSubtitle"');
    expect(source).not.toContain('<p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("ui.activity.moreFromVendor")}</p>');
    expect(source).toContain('id="more-from-outlet-heading" className="text-xl font-black tracking-tight sm:text-2xl">{t("ui.activity.moreFromVendor")}</h2>');
    expect(source).toContain('t("ui.actions.visitVendor")');
    expect(source).toContain("relatedProducts.map((product) => (");
    expect(source).toContain("<ProductCard");
  });
});
