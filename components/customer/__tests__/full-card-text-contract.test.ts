import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

const contentCardFiles = [
  "components/customer/activity-card.tsx",
  "components/customer/activity-reviews.tsx",
  "components/customer/vendor-card.tsx",
  "components/customer/vendor-reviews-list.tsx",
  "components/customer/place-card.tsx",
  "components/customer/place-activity-card.tsx",
  "components/customer/place-community-section.tsx",
  "components/customer/saved-destination-card.tsx",
  "components/customer/nearby-outlets.tsx",
  "components/customer/sponsored-partner-rail.tsx",
  "components/guest/guest-catalogue.tsx",
  "components/outlet/outlet-menu.tsx",
  "components/outlet/outlet-block-renderer.tsx",
  "components/outlet/outlet-page-renderer.tsx",
  "components/customer/operating-hours-summary.tsx",
  "app/customer/search/search-client.tsx",
  "app/customer/vendor/[vendorId]/page.tsx",
  "app/customer/destination/[destinationId]/page.tsx",
  "app/customer/cart/page.tsx",
  "app/customer/checkout/page.tsx",
  "app/customer/orders/page.tsx",
  "app/customer/orders/[id]/page.tsx",
  "app/customer/vouchers/voucher-hub-client.tsx",
  "app/customer/calendar/page.tsx",
  "components/customer/booking-day-drawer.tsx",
  "components/customer/refund-request-dialog.tsx",
  "components/customer/wallet/customer-transaction-history.tsx",
  "components/customer/recommendation-earnings-panel.tsx",
  "app/customer/affiliate/page.tsx",
  "app/customer/activity/[id]/activity-detail-client.tsx",
  "app/customer/trip/[tripId]/trip-planner-client.tsx",
  "app/customer/recommendations/page.tsx",
  "app/customer/support/[id]/page.tsx",
  "app/customer/design-demo/design-demo-client.tsx",
];

describe("full user-facing card content contract", () => {
  it("lets shared card titles and metadata wrap without a clamp or ellipsis", () => {
    const styles = read("app/globals.css");
    const titleRules = styles.match(/\.mw-card-title\s*\{([^}]*)\}/)?.[1] ?? "";
    const metaRules = styles.match(/\.mw-card-meta\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(titleRules).toContain("overflow-wrap: anywhere;");
    expect(titleRules).not.toContain("line-clamp");
    expect(titleRules).not.toContain("overflow: hidden;");
    expect(metaRules).toContain("white-space: normal;");
    expect(metaRules).toContain("overflow-wrap: anywhere;");
    expect(metaRules).not.toContain("text-overflow: ellipsis;");
  });

  it("does not clamp or ellipsize text in data-bearing cards and summaries", () => {
    for (const file of contentCardFiles) {
      const source = read(file);
      expect(source, file).not.toMatch(/line-clamp-[1-6]/);
      expect(source, file).not.toMatch(/\btruncate\b/);
    }
  });

  it("wraps full item names in chat context cards while preserving message previews", () => {
    const source = read("components/customer/chat-thread-panel.tsx");

    expect(source).toContain('className="block break-words whitespace-normal text-xs font-semibold text-foreground">{message.context.title}');
    expect(source).toContain('className="block break-words whitespace-normal text-[0.6875rem] text-muted-foreground">{message.context.subtitle}');
    expect(source).toContain("truncateChatMessage(quoted.text");
  });
});
