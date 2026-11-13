import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeaturedSplitCard } from "@/components/customer/featured-split-card";

describe("FeaturedSplitCard", () => {
  it("renders the split and stacked layouts without the retired ticket stub", () => {
    const split = renderToStaticMarkup(<FeaturedSplitCard media={<span>Photo</span>}>Content</FeaturedSplitCard>);
    const stacked = renderToStaticMarkup(<FeaturedSplitCard layout="stacked" media={<span>Photo</span>}>Content</FeaturedSplitCard>);
    expect(split).toContain("md:grid-cols-[52%_48%]");
    expect(stacked).toContain("grid min-h-0 w-full grid-cols-1");
    for (const markup of [split, stacked]) expect(markup).not.toContain('data-slot="featured-end"');
  });

  it("wraps the whole card in a link when it has an href", () => {
    const markup = renderToStaticMarkup(<FeaturedSplitCard href="/customer/events/a" media={<span>Photo</span>}>Content</FeaturedSplitCard>);
    expect(markup).toContain('href="/customer/events/a"');
  });
});
