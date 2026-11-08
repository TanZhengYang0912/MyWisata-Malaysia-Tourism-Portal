import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findOne, installTestDom, type TestDocument, type TestElement } from "@/components/shared/__tests__/render-test-dom";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/customer/orders/order-1" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

import { CustomerSiteFooter } from "@/components/customer/customer-site-footer";

let document: TestDocument;
let container: TestElement;
let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof import("react-dom/client").createRoot> | undefined;

async function renderFooter(variant: "full" | "slim") {
  await act(async () => {
    root?.render(<CustomerSiteFooter variant={variant} />);
    await Promise.resolve();
  });
}

beforeAll(async () => {
  document = installTestDom();
  ({ createRoot } = await import("react-dom/client"));
});

beforeEach(() => {
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

describe("customer site footer print visibility", () => {
  it.each(["full", "slim"] as const)("hides the %s site footer when printing", async (variant) => {
    await renderFooter(variant);

    const footer = findOne(container, (element) => element.tagName === "FOOTER");
    expect(footer.className).toContain("print:hidden");
  });
});
