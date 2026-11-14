import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const pagePath = resolve(workspace, "app/customer/checkout/success/page.tsx");
const successPageSource = existsSync(pagePath) ? readFileSync(pagePath, "utf8") : "";
const startPaymentSource = readFileSync(resolve(workspace, "lib/checkout/start-payment.ts"), "utf8");
const localeResources = Object.fromEntries(
  (["en", "ms", "zh-CN"] as const).map((locale) => [
    locale,
    JSON.parse(readFileSync(resolve(workspace, `app/i18n/locales/${locale}/customer.json`), "utf8")) as Record<string, unknown>,
  ]),
);

function lookup(resource: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) =>
    value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined, resource);
}

describe("Stripe checkout success return", () => {
  it("routes order payments to the dedicated status page", () => {
    expect(startPaymentSource).toContain("/customer/checkout/success?stripe_session_id=");
  });

  it("confirms payment before rendering the order action", () => {
    expect(existsSync(pagePath)).toBe(true);
    expect(successPageSource).toContain("/api/checkout/confirm-stripe");
    expect(successPageSource).toContain('status !== "paid"');
    expect(successPageSource).toContain("/customer/orders/${orderId}");
  });

  it("has concise status and order labels in all supported customer languages", () => {
    for (const locale of ["en", "ms", "zh-CN"] as const) {
      for (const key of ["ui.checkout.successTitle", "ui.checkout.checkingPayment", "ui.checkout.paymentNotConfirmed", "ui.checkout.viewOrder", "ui.checkout.retryPaymentCheck"]) {
        expect(lookup(localeResources[locale], key), `${locale}:${key}`).toEqual(expect.any(String));
      }
    }
  });
});
