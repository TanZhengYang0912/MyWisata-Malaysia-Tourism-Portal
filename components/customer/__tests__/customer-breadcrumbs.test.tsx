import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/customer/explore" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { CustomerBreadcrumbs } from "@/components/customer/customer-breadcrumbs";

describe("CustomerBreadcrumbs", () => {
  it("renders an automatic trail for ordinary routes", () => {
    state.pathname = "/customer/explore";
    const markup = renderToStaticMarkup(<CustomerBreadcrumbs />);
    expect(markup).toContain('href="/customer"');
    expect(markup).toContain("navigation.explore");
    expect(markup).toContain('aria-current="page"');
  });

  it("does not add a trail to page-owned detail or checkout routes", () => {
    for (const pathname of ["/customer/vendor/v1", "/customer/checkout", "/customer/trip/t1"]) {
      state.pathname = pathname;
      expect(renderToStaticMarkup(<CustomerBreadcrumbs />)).toBe("");
    }
  });
});
