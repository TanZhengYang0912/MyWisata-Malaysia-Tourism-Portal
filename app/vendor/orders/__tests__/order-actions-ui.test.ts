import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/vendor/orders/page.tsx"),
  "utf8",
);
const batchSource = readFileSync(
  resolve(process.cwd(), "components/vendor/batch-action-bar.tsx"),
  "utf8",
);

describe("vendor order actions UI contract", () => {
  it("uses visible action labels and a shared confirmation dialog", () => {
    expect(source).toContain(
      'import ActionConfirmationDialog from "@/components/vendor/action-confirmation-dialog";',
    );
    expect(source).toContain('t("ui.orders.viewDetails")');
    expect(source).toContain('t("ui.orders.markReady")');
    expect(source).toContain('t("ui.orders.fulfil")');
    expect(source).toContain("ActionConfirmationDialog");
    expect(source).toContain('aria-label={t("ui.orders.close")}');
  });

  it("does not leave order-level fulfilment actions ambiguous for mixed items", () => {
    expect(source).toMatch(/getOrderFulfilmentAction\(\s*order\.status/);
    expect(source).toContain('t("ui.orders.reviewItems")');
    expect(source).toContain('t("ui.orders.batchNoEligibleActions")');
  });

  it("keeps the drawer focused on one order-level action for uniform orders", () => {
    expect(source).toContain('itemAction && selectedOrderAction === "review"');
  });

  it("keeps action controls centered and protects the desktop table from clipping", () => {
    expect(source).toContain('className="text-center"');
    expect(source).toContain("justify-center gap-2 border-t");
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("xl:min-w-[960px]");
    expect(source).toContain("xl:grid-cols-[32px_minmax(120px,1.2fr)");
  });

  it("labels the generic batch controls for keyboard and screen-reader users", () => {
    expect(batchSource).toContain("aria-label={t('batch.actionToApply')}");
    expect(batchSource).toContain("aria-label={t('batch.applyAction')}");
    expect(batchSource).toContain("aria-label={t('batch.clearSelection')}");
  });
});
