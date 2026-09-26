import React, { act } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findOne, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), toDataURL: vi.fn() }));

vi.stubGlobal("fetch", mocks.fetch);
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.toDataURL } }));

import { FoodOrderQrCodes } from "@/components/customer/food-order-qr-codes";

let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;
let createRoot: typeof import("react-dom/client").createRoot;
let i18n: ReturnType<typeof createInstance>;

async function render(element: React.ReactElement) {
  await act(async () => {
    root?.render(element);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("FoodOrderQrCodes rendered merchant and QR layout", () => {
  beforeAll(async () => {
    document = installTestDom();
    Object.defineProperty(window, "location", { configurable: true, value: { origin: "http://localhost:3000" } });
    ({ createRoot } = await import("react-dom/client"));
    const resources = Object.fromEntries(["en", "ms", "zh-CN"].map((locale) => [
      locale,
      { customer: JSON.parse(readFileSync(resolve(process.cwd(), `app/i18n/locales/${locale}/customer.json`), "utf8")) },
    ]));
    i18n = createInstance();
    await i18n.use(initReactI18next).init({
      lng: "en",
      resources,
      ns: ["customer"],
      defaultNS: "customer",
      interpolation: { escapeValue: false },
    });
  });

  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          foodOrders: [{
            outletId: "outlet-a",
            outletName: "Armenian Street Kitchen",
            vendorName: "Baboon House",
            mode: "takeaway",
            status: "pending",
            items: [{ name: "Nasi Lemak", variant: null, quantity: 2 }],
            foodToken: "food-token-a",
          }],
        },
      }),
    });
    mocks.toDataURL.mockResolvedValue("data:image/png;base64,qr");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = undefined;
    }
    document.body.removeChild(container);
  });

  it.each([
    { locale: "en", merchant: "Provided by Baboon House", mode: "Takeaway" },
    { locale: "ms", merchant: "Disediakan oleh Baboon House", mode: "Bungkus" },
    { locale: "zh-CN", merchant: "提供商家：Baboon House", mode: "打包" },
  ])("renders $locale merchant copy without keys and keeps QR after details", async ({ locale, merchant, mode }) => {
    await act(async () => { await i18n.changeLanguage(locale); });
    await render(<I18nextProvider i18n={i18n}><FoodOrderQrCodes orderId="order-a" /></I18nextProvider>);

    const card = findOne(container, (element) => element.getAttribute("data-qr-pass-card") === "true");
    const details = findOne(card, (element) => element.getAttribute("data-qr-pass-details") === "true");
    const qr = findOne(card, (element) => element.getAttribute("data-qr-pass-code") === "true");

    expect(card.childNodes[0]).toBe(details);
    expect(card.childNodes[1]).toBe(qr);
    expect(details.textContent).toContain("Armenian Street Kitchen");
    expect(details.textContent).toContain(merchant);
    expect(container.textContent).toContain(mode);
    expect(container.textContent).toContain("2 × Nasi Lemak");
    expect(container.textContent).not.toMatch(/ui\.[a-zA-Z]/);
  });
});
