import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { PhotoRatingBadge, ratingColor } from "@/components/customer/photo-rating-badge";

describe("PhotoRatingBadge", () => {
  it("shows the score, the review count and a star filled to rating/5", () => {
    const markup = renderToStaticMarkup(<PhotoRatingBadge rating={4.4} reviews={8} />);
    expect(markup).toContain(">4.4<");
    expect(markup).toContain("(8)");
    expect(markup).toContain('data-slot="photo-rating-badge"');
    expect(markup).toContain("pointer-events-none");
    expect(markup).toContain('offset="88%"');
  });

  it("rounds the score to one decimal and the fill to a whole percent", () => {
    const markup = renderToStaticMarkup(<PhotoRatingBadge rating={4.56} reviews={3} />);
    expect(markup).toContain(">4.6<");
    expect(markup).toContain('offset="91%"');
  });

  it("puts the caller's className on the root element", () => {
    const markup = renderToStaticMarkup(<PhotoRatingBadge rating={4} reviews={1} className="absolute right-3" />);
    expect(markup).toMatch(/<div[^>]*data-slot="photo-rating-badge"[^>]*class="[^"]*absolute right-3/);
  });

  it("shows an empty star and the no-reviews text when there are no reviews", () => {
    const markup = renderToStaticMarkup(<PhotoRatingBadge rating={0} reviews={0} />);
    expect(markup).toContain("ui.activity.noReviewsYet");
    expect(markup).toContain('offset="0%"');
    expect(markup).not.toContain("(0)");
  });

  it("drops the no-reviews text to screen readers on phones only when asked", () => {
    const compact = renderToStaticMarkup(<PhotoRatingBadge rating={0} reviews={0} compactOnPhone />);
    expect(compact).toContain("sr-only sm:not-sr-only");
    expect(compact).toContain("max-sm:pr-1");
    for (const markup of [
      renderToStaticMarkup(<PhotoRatingBadge rating={4.4} reviews={8} compactOnPhone />),
      renderToStaticMarkup(<PhotoRatingBadge rating={0} reviews={0} />),
    ]) {
      expect(markup).not.toContain("sr-only");
      expect(markup).not.toContain("max-sm:pr-1");
    }
  });
});

describe("ratingColor", () => {
  it("returns the stop colours and clamps to 0–5", () => {
    expect(ratingColor(5)).toBe("#2bb7d6");
    expect(ratingColor(0)).toBe("#f07c24");
    expect(ratingColor(4.5)).toBe("#4fc0b9");
    expect(ratingColor(7)).toBe(ratingColor(5));
    expect(ratingColor(-1)).toBe(ratingColor(0));
  });

  it("blends linearly between stops as lowercase hex", () => {
    expect(ratingColor(4.25)).toMatch(/^#[0-9a-f]{6}$/);
    expect(ratingColor(4.25)).not.toBe(ratingColor(4));
    expect(ratingColor(4.25)).not.toBe(ratingColor(4.5));
  });
});
