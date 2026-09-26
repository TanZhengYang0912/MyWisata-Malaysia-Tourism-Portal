import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("customer voucher hub UI contract", () => {
  it("exposes the browse and claimed-voucher tabs", () => {
    const source = read("app/customer/vouchers/voucher-hub-client.tsx");
    expect(source).toContain('tCustomer("ui.voucherHub.browseDeals")');
    expect(source).toContain('tCustomer("ui.voucherHub.myVouchers")');
    expect(source).toContain("tCustomer(`ui.voucherHub.actions.${actionKey}`)");
    expect(source).toContain('tCustomer("ui.voucherHub.useNow")');
  });

  it("explains online checkout redemption and uses the customer voucher API", () => {
    const source = read("app/customer/vouchers/voucher-hub-client.tsx");
    expect(source).toContain("redemptionMode");
    expect(source).toContain("CircleHelp");
    expect(source).toContain('tCustomer("ui.voucherHub.helpTitle")');
    expect(source).toContain('tCustomer("ui.voucherHub.helpStep1")');
    expect(source).toContain("group-hover:block");
    expect(source).toContain("/api/customer/vouchers");
    expect(source).toContain("/api/customer/vouchers/claim");
    expect(source).toContain("buildVoucherUseHref");
  });

  it("presents one outlet voucher with real product coverage instead of one card per product", () => {
    const source = read("app/customer/vouchers/voucher-hub-client.tsx");
    expect(source).toContain('tCustomer("ui.voucherHub.allEligibleProducts")');
    expect(source).toContain("eligibleProductCount");
    expect(source).toContain("eligibleProductNames");
  });

  it("uses outlet imagery before vendor initials in voucher cards", () => {
    const browse = read("app/api/customer/vouchers/route.ts");
    const client = read("app/customer/vouchers/voucher-hub-client.tsx");
    const types = read("lib/customer/voucher-claims.ts");
    expect(browse).toContain("resolveOutletImage");
    expect(browse).toContain("outletImageUrl");
    expect(client).toContain("voucher.outletImageUrl");
    expect(client).toContain("voucher.vendorLogoUrl");
    expect(types).toContain("outletImageUrl: string | null");
  });

  it("gives voucher tickets a responsive image-led horizontal treatment", () => {
    const source = read("app/customer/vouchers/voucher-hub-client.tsx");
    const ticket = read("components/vouchers/voucher-ticket.tsx");
    expect(source).toContain("<VoucherTicket");
    expect(source).toContain('className="space-y-5"');
    expect(ticket).toContain("sm:w-[34%]");
    expect(ticket).toContain("max-sm:flex-col");
    expect(ticket).toContain("loading=\"lazy\"");
  });

  it("uses a fallback photo as a full-bleed cover instead of a square logo tile", () => {
    const ticket = read("components/vouchers/voucher-ticket.tsx");
    expect(ticket).toContain('<img src={offer.fallback.logoUrl} alt={offer.fallback.logoAlt} width={640} height={480} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />');
    expect(ticket).not.toContain("h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-white/95 object-contain p-3");
  });

  it("uses one shared ticket treatment for customer vouchers and vendor previews", () => {
    const customer = read("app/customer/vouchers/voucher-hub-client.tsx");
    const vendor = read("app/vendor/vouchers/page.tsx");
    const ticket = read("components/vouchers/voucher-ticket.tsx");
    expect(customer).toContain('from "@/components/vouchers/voucher-ticket"');
    expect(customer).toContain("<VoucherTicket");
    expect(vendor).toContain("@/components/vouchers/voucher-ticket");
    expect(vendor).toContain("<VoucherTicket");
    expect(ticket).toContain("data-voucher-ticket");
    expect(ticket).toContain("border-dashed");
  });

  it("explains why the browse list is empty without inventing partner data", () => {
    const source = read("app/customer/vouchers/voucher-hub-client.tsx");
    expect(source).toContain('tab === "mine" ? "ui.voucherHub.emptyMineTitle" : "ui.voucherHub.emptyDealsTitle"');
    expect(source).toContain('tab === "mine" ? "ui.voucherHub.emptyMineDescription" : "ui.voucherHub.emptyDealsDescription"');
  });

  it("adds a customer voucher route to the account navigation", () => {
    const navigation = read("lib/customer/header-navigation.ts");
    const layout = read("app/customer/layout.tsx");
    expect(navigation).toContain("/customer/vouchers");
    expect(layout).toContain("/customer/vouchers");
  });

  it("places the voucher view switch on the right like Explore", () => {
    const source = read("app/customer/vouchers/voucher-hub-client.tsx");
    expect(source).toContain("flex shrink-0 flex-col items-end gap-3 lg:pt-1");
    expect(source).toContain("inline-flex rounded-2xl border border-border bg-card p-2 shadow-sm");
  });

  it("keeps the exclusive deals intro and voucher view switch in one desktop row", () => {
    const source = read("app/customer/vouchers/voucher-hub-client.tsx");
    expect(source).toContain("flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between");
    expect(source).toContain('role="tablist" aria-label={tCustomer("ui.voucherHub.viewsLabel")}');
  });

  it("places the desktop My Vouchers action after the cart in the customer header", () => {
    const source = read("app/customer/layout.tsx");
    const cartPosition = source.indexOf('href="/customer/cart"');
    const vouchersPosition = source.indexOf('href="/customer/vouchers" aria-label={tCustomer("accountItems.vouchers.label")}');
    expect(cartPosition).toBeGreaterThanOrEqual(0);
    expect(vouchersPosition).toBeGreaterThan(cartPosition);
  });
});
