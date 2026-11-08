import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("source=vendor") }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { CustomerPrimaryNavigation } from "@/components/customer/customer-primary-navigation";

describe("CustomerPrimaryNavigation", () => {
  it.each(["single", "stacked"] as const)("renders text links and the active blue underline in %s layout", (layout) => {
    const markup = renderToStaticMarkup(<CustomerPrimaryNavigation pathname="/customer/products/p1" layout={layout} />);
    expect(markup.match(/<a /g)).toHaveLength(5);
    expect(markup).not.toContain("<svg");
    expect(markup).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/customer\/vendors"/);
    expect(markup).toContain("bg-primary");
  });
});
