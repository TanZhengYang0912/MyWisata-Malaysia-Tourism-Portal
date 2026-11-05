import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props}>{children}</a> }));

import { ExpandCard } from "@/components/customer/expand-card";

const base = {
  media: <span>Cover media</span>,
  title: <h3>Card title</h3>,
  details: <p>Hidden details</p>,
  detailsId: "card-1-details",
  action: { href: "/x", label: "Go" },
};

describe("ExpandCard", () => {
  it("puts the primary action under the expandable details so opening pushes it to the bottom", () => {
    const markup = renderToStaticMarkup(<ExpandCard {...base} price={<span>RM1</span>} />);

    expect(markup).toContain('class="mw-card mw-card-expand-card group"');
    expect(markup).toContain("Card title");
    expect(markup).toContain('id="card-1-details"');
    expect(markup).toContain('data-card-details-inline="true"');

    const priceIndex = markup.indexOf("mw-card-price-row");
    const actionIndex = markup.indexOf('data-card-primary-cta="true"');
    const detailsIndex = markup.indexOf('data-card-details-inline="true"');
    expect(priceIndex).toBeGreaterThanOrEqual(0);
    expect(priceIndex).toBeLessThan(detailsIndex);
    expect(detailsIndex).toBeLessThan(actionIndex);
    expect(markup).toMatch(/<a [^>]*href="\/x"[^>]*data-card-primary-cta="true"[^>]*>Go<\/a>/);
    expect(markup).toContain("Hidden details");
  });

  it("omits the price row when no price is given", () => {
    expect(renderToStaticMarkup(<ExpandCard {...base} />)).not.toContain("mw-card-price-row");

    const priced = renderToStaticMarkup(<ExpandCard {...base} price={<span>RM1</span>} />);
    expect(priced).toContain("mw-card-price-row");
    expect(priced).toContain("RM1");
  });
});
