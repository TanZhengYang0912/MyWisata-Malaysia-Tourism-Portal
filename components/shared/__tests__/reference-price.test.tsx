import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ReferenceCurrencyProvider } from "@/components/providers/reference-currency";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { amount?: string; date?: string }) => {
      if (key === "currency.rateDate") return `Reference rate dated ${values?.date}.`;
      if (key === "currency.settlementAmount") return `Charged as ${values?.amount}`;
      return "Converted amounts are estimates for reference only.";
    },
    i18n: { resolvedLanguage: "en" },
  }),
}));

const { ReferencePrice } = await import("../reference-price");

describe("ReferencePrice", () => {
  it("promotes the selected currency without an ISO code or approximation marker", () => {
    const markup = renderToStaticMarkup(
      <ReferenceCurrencyProvider
        currency="USD"
        snapshot={{ base: "MYR", quote: "USD", rate: 0.2367, date: "2026-09-11", provider: "BNM" }}
      >
        <ReferencePrice amountMYR={120} />
      </ReferenceCurrencyProvider>,
    );

    expect(markup).toContain("US$28.40");
    expect(markup).not.toContain("RM120.00");
    expect(markup).not.toContain("≈");
    expect(markup).not.toContain("USD28.40");
    expect(markup).toContain("2026-09-11");
  });

  it("can add the exact MYR settlement amount at a purchase boundary", () => {
    const markup = renderToStaticMarkup(
      <ReferenceCurrencyProvider
        currency="CNY"
        snapshot={{ base: "MYR", quote: "CNY", rate: 1.705, date: "2026-09-11", provider: "BNM" }}
      >
        <ReferencePrice amountMYR={120} showSettlementMYR />
      </ReferenceCurrencyProvider>,
    );

    expect(markup).toContain("¥204.60");
    expect(markup).toContain("Charged as RM120.00");
  });

  it("renders only MYR when MYR is selected or the snapshot does not match", () => {
    const myrMarkup = renderToStaticMarkup(
      <ReferenceCurrencyProvider currency="MYR" snapshot={null}>
        <ReferencePrice amountMYR={120} />
      </ReferenceCurrencyProvider>,
    );
    const mismatchedMarkup = renderToStaticMarkup(
      <ReferenceCurrencyProvider
        currency="EUR"
        snapshot={{ base: "MYR", quote: "USD", rate: 0.2367, date: "2026-09-11", provider: "BNM" }}
      >
        <ReferencePrice amountMYR={120} />
      </ReferenceCurrencyProvider>,
    );

    expect(myrMarkup).toContain("RM120.00");
    expect(myrMarkup).not.toContain("Charged as");
    expect(mismatchedMarkup).toContain("RM120.00");
    expect(mismatchedMarkup).not.toContain("Charged as");
  });
});
