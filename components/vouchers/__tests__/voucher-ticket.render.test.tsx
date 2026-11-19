import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/customer/voucher-barcode", () => ({
  VoucherBarcode: ({ value }: { value: string }) => <svg data-barcode={value} />,
}));

import { VoucherTicket, type VoucherTicketOffer } from "../voucher-ticket";

const base: VoucherTicketOffer = {
  brandName: "Penang Road Famous Teochew Chendul",
  name: "Penang Road Famous Teochew Chendul",
  outletBadge: "Lebuh Keng Kwee branch",
  codeCopyLabels: { copy: "Copy", copied: "Copied" },
  discountLabel: "RM0.01 off",
  minSpendLabel: null,
  expiryLabel: "Ends 10 Oct 2026",
  expiry: { label: "Ends", endsAt: "2026-10-10T15:59:59Z", noEndLabel: "No expiry date", locale: "en" },
  availabilityLabel: "1 remaining",
  scopeLabel: "Outlet voucher",
  locationLabel: "George Town, Penang",
  identityLabel: "Verified",
  image: { src: "/outlet.jpg", alt: "Outlet photo" },
};

const render = (offer: Partial<VoucherTicketOffer>, children: React.ReactNode = <button type="button">Claim</button>) =>
  renderToStaticMarkup(<VoucherTicket offer={{ ...base, ...offer }}>{children}</VoucherTicket>);

describe("VoucherTicket", () => {
  it("puts the last valid day on the stub of an unclaimed voucher, in Malaysia time", () => {
    // 15:59Z on 10 Oct is 23:59 on 10 Oct in Kuala Lumpur.
    const html = render({});
    expect(html).toContain(">Ends Oct<");
    expect(html).toContain(">10<");
    expect(html).toContain(">2026<");
    // The stub already says when it ends, so the meta line does not repeat it.
    expect(html).not.toContain("Ends 10 Oct 2026");
    // The action sits on the stub, after the date and stock, like a ticket's tear-off.
    expect(html.indexOf(">Claim<")).toBeGreaterThan(html.indexOf("1 remaining"));
    expect(html.indexOf(">Claim<")).toBeGreaterThan(html.indexOf("RM0.01 off"));
  });

  it("shows the plain photo with no overlay or text on it", () => {
    const html = render({});
    expect(html).toContain('src="/outlet.jpg"');
    expect(html).not.toContain("bg-gradient-to-t");
  });

  it("says a voucher never expires instead of inventing a date", () => {
    const html = render({ expiry: { ...base.expiry!, endsAt: null } });
    expect(html).toContain("No expiry date");
    expect(html).not.toContain(">Ends Oct<");
  });

  it("hands over the code and barcode on the stub once claimed, and keeps the expiry visible", () => {
    const html = render({ code: "CHENDUL01", codeLabel: "Voucher code", barcodeValue: "token-1", barcodeLabel: "Barcode" });
    expect(html).toContain("CHENDUL01");
    expect(html).toContain('data-barcode="token-1"');
    expect(html).not.toContain(">Ends Oct<");
    expect(html).toContain("Ends 10 Oct 2026");
  });

  it("renders the eligible-products strip under the ticket", () => {
    const html = render({ strip: <section aria-label="All eligible products">5 products available</section> });
    expect(html).toContain('aria-label="All eligible products"');
    expect(html).toContain("5 products available");
  });
});
