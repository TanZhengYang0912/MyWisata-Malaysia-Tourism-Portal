import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/vendor/orders/page.tsx"),
  "utf8",
);

describe("vendor order details layout", () => {
  it("places the order action with overall fulfilment and removes the visible close button", () => {
    const fulfilmentLabel = source.indexOf(
      '{t("ui.orders.overallFulfilment")}',
    );
    const orderAction = source.indexOf(
      "requestOrderAction(selectedItem, selectedOrderAction)",
      fulfilmentLabel,
    );
    const orderItemsHeading = source.indexOf(
      '{t("ui.orders.orderItems")}',
      fulfilmentLabel,
    );
    const orderDetailsStart = source.indexOf("{selectedItem && (");
    const modalEnd = source.indexOf("</CenteredDetailModal>", orderDetailsStart);
    const orderDetails = source.slice(orderDetailsStart, modalEnd);

    expect(fulfilmentLabel).toBeGreaterThanOrEqual(0);
    expect(orderAction).toBeGreaterThan(fulfilmentLabel);
    expect(orderAction).toBeLessThan(orderItemsHeading);
    expect(source).not.toContain(
      'className="mt-7 flex flex-wrap justify-center gap-2"',
    );
    expect(orderDetails).not.toMatch(
      /<button\b[^>]*>\s*\{t\("ui\.orders\.close"\)\}\s*<\/button>/,
    );
  });

  it("uses the shared centered detail modal instead of a right drawer", () => {
    expect(source).toContain(
      'import CenteredDetailModal from "@/components/ui/centered-detail-modal";',
    );
    expect(source).not.toContain("absolute right-0 top-0");
  });
});
