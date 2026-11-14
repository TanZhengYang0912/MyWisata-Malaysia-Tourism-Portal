import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/app/i18n/locales/en/customer.json";
import { findElements, findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

const ORDER_ID = "1d4057cf-c821-4b05-a454-61dbdc42d32c";
const mocks = vi.hoisted(() => {
  const replace = vi.fn();
  return {
    fetch: vi.fn(),
    replace,
    router: { replace },
    currentUser: null as { id: string } | null,
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key.split(".").reduce<unknown>((value, part) =>
      value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined, en) ?? key,
  }),
}));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: mocks.currentUser }) }));

import CheckoutSuccessPage from "../page";

let document: TestDocument;
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot>;
let container: TestElement;

async function settle() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

async function renderPage() {
  await act(async () => { root.render(<CheckoutSuccessPage />); await settle(); });
}

function response(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

beforeAll(async () => {
  document = installTestDom();
  ({ createRoot } = await import("react-dom/client"));
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser = null;
  Object.assign(globalThis.window, { location: { search: "?stripe_session_id=cs_test_paid" } });
  mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/checkout/confirm-stripe") {
      return response({ data: { order_id: ORDER_ID, status: "paid" } });
    }
    return response({ data: { attributed: true } });
  });
  vi.stubGlobal("fetch", mocks.fetch);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.removeChild(container);
  vi.unstubAllGlobals();
});

describe("Stripe payment success page", () => {
  it("shows success and the exact order only after server confirmation", async () => {
    mocks.currentUser = { id: "user-1" };
    let resolveConfirmation!: (response: Response) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveConfirmation = resolve; }));

    await renderPage();

    expect(container.textContent).toContain(en.ui.checkout.checkingPayment);
    expect(container.textContent).not.toContain(en.ui.checkout.successTitle);

    await act(async () => {
      resolveConfirmation(response({ data: { order_id: ORDER_ID, status: "paid" } }));
      await settle();
    });

    expect(container.textContent).toContain(en.ui.checkout.successTitle);
    expect(findOne(container, (node) => node.tagName === "A" && node.getAttribute("href") === `/customer/orders/${ORDER_ID}`)).toBeTruthy();
    expect(mocks.fetch).toHaveBeenCalledWith("/api/checkout/confirm-stripe", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ stripeSessionId: "cs_test_paid" }),
    }));
    expect(mocks.fetch).toHaveBeenCalledWith("/api/checkout/attribute", expect.anything());
  });

  it("offers an idempotent status retry after an unconfirmed return", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({ error: "Stripe payment is not confirmed as paid" }, false))
      .mockResolvedValueOnce(response({ data: { order_id: ORDER_ID, status: "paid" } }));

    await renderPage();

    expect(container.textContent).toContain(en.ui.checkout.paymentNotConfirmed);
    expect(container.textContent).not.toContain(en.ui.checkout.successTitle);
    await act(async () => {
      findElements(container, (node) => node.tagName === "BUTTON" && node.textContent === en.ui.checkout.retryPaymentCheck)[0]
        .dispatchEvent(new TestEvent("click", { bubbles: true }));
      await settle();
    });

    expect(container.textContent).toContain(en.ui.checkout.successTitle);
    expect(mocks.fetch.mock.calls.filter(([input]) => String(input) === "/api/checkout/confirm-stripe")).toHaveLength(2);
  });

  it("does not call the confirmation endpoint without a Stripe session and keeps guest recovery public", async () => {
    Object.assign(globalThis.window, { location: { search: "" } });

    await renderPage();

    expect(container.textContent).toContain(en.ui.checkout.paymentStatusUnavailable);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(findOne(container, (node) => node.tagName === "A" && node.getAttribute("href") === "/customer/orders/access")).toBeTruthy();
  });

  it("keeps payment exceptions on the existing order detail route", async () => {
    mocks.fetch.mockImplementationOnce(async () => response({ data: { order_id: ORDER_ID, status: "payment_exception" } }));

    await renderPage();

    expect(mocks.replace).toHaveBeenCalledWith(`/customer/orders/${ORDER_ID}`);
    expect(container.textContent).not.toContain(en.ui.checkout.successTitle);
  });
});
