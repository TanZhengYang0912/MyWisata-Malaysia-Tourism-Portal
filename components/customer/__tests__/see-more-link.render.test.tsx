import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => (key === "ui.actions.seeMore" ? "See More" : key) }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));

import { SeeMoreLink } from "@/components/customer/see-more-link";

describe("SeeMoreLink", () => {
  it("shows See More with no underline, and names its destination after the visible text", () => {
    const markup = renderToStaticMarkup(<SeeMoreLink href="/customer/outlets/o1" ariaLabel="Visit outlet" />);
    expect(markup).toContain('href="/customer/outlets/o1"');
    expect(markup).toContain(">See More</a>");
    expect(markup).toContain('aria-label="See More: Visit outlet"');
    expect(markup).not.toContain("underline");
  });

  it("leaves the accessible name to the visible text when no destination is given", () => {
    expect(renderToStaticMarkup(<SeeMoreLink href="/customer/events" />)).not.toContain("aria-label");
  });
});
