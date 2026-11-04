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
});
