import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VendorMobileRecordCard } from "@/components/vendor/mobile-record-card";

describe("VendorMobileRecordCard", () => {
  it("renders the shared record header, content, and optional actions semantically", () => {
    const markup = renderToStaticMarkup(
      <VendorMobileRecordCard
        header={<span>Customer Bob</span>}
        footer={<button type="button">Mark ready</button>}
      >
        <p>Chicken Rice Set</p>
      </VendorMobileRecordCard>,
    );

    expect(markup).toContain("<article");
    expect(markup).toContain("data-mobile-record-card-header");
    expect(markup).toContain("data-mobile-record-card-content");
    expect(markup).toContain("data-mobile-record-card-footer");
    expect(markup).toContain("Customer Bob");
    expect(markup).toContain("Chicken Rice Set");
    expect(markup).toContain("Mark ready");
  });

  it("does not render an empty action region when the record has no actions", () => {
    const markup = renderToStaticMarkup(
      <VendorMobileRecordCard header={<span>Event order</span>}>
        <p>Pickup at 10:30</p>
      </VendorMobileRecordCard>,
    );

    expect(markup).toContain("Event order");
    expect(markup).toContain("Pickup at 10:30");
    expect(markup).not.toContain("data-mobile-record-card-footer");
  });
});
