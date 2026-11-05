import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeaturedSplitCard } from "@/components/customer/featured-split-card";

describe("FeaturedSplitCard", () => {
  it("keeps the default split while exposing a separate event-pass end region", () => {
    const normal = renderToStaticMarkup(<FeaturedSplitCard media={<span>Photo</span>}>Content</FeaturedSplitCard>);
    expect(normal).not.toContain('data-slot="featured-end"');
    const pass = renderToStaticMarkup(<FeaturedSplitCard variant="event-pass" media={<span>Photo</span>} endContent={<span>End date</span>}>Content</FeaturedSplitCard>);
    expect(pass).toContain('data-slot="featured-end"');
    expect(pass).toContain("44%");
  });

  it("renders a footer under the grid and only then clips the grid", () => {
    const plain = renderToStaticMarkup(<FeaturedSplitCard variant="event-pass" media={<span>Photo</span>}>Content</FeaturedSplitCard>);
    const withFooter = renderToStaticMarkup(<FeaturedSplitCard variant="event-pass" media={<span>Photo</span>} footer={<p>Stalls</p>}>Content</FeaturedSplitCard>);
    expect(plain.match(/class="grid [^"]*"/)?.[0]).not.toContain("overflow-hidden");
    expect(withFooter.match(/class="grid [^"]*"/)?.[0]).toContain("overflow-hidden");
    expect(withFooter.indexOf("<p>Stalls</p>")).toBeGreaterThan(withFooter.indexOf('data-slot="featured-end"'));
  });
});
