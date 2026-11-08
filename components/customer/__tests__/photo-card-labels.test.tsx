import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("lucide-react", () => ({
  Megaphone: () => <svg data-icon="megaphone" />,
  Sparkles: ({ className }: { className?: string }) => <svg data-icon="sparkles" className={className} />,
}));
import { PhotoCardLabels, PhotoRatingBadge } from "@/components/customer/photo-rating-badge";

const GLASS = "bg-[rgba(15,15,30,.6)] text-white backdrop-blur-[8px]";

describe("PhotoCardLabels", () => {
  it("renders nothing without a label", () => {
    expect(renderToStaticMarkup(<PhotoCardLabels />)).toBe("");
  });

  it("puts Sponsored (megaphone) before Featured (yellow sparkles) on the rating badge's glass, wrapping clear of the photo buttons", () => {
    const markup = renderToStaticMarkup(<PhotoCardLabels sponsored featured />);
    expect(markup.indexOf("ui.labels.sponsored")).toBeLessThan(markup.indexOf("ui.labels.featured"));
    expect(markup).toContain('data-icon="megaphone"');
    expect(markup).toMatch(/data-icon="sparkles" class="[^"]*text-\[#ffcc00\]/);
    expect(markup.split(GLASS)).toHaveLength(3);
    expect(markup).toContain("flex-wrap");
    expect(markup).toContain("right-14");
  });

  it("shares the glass with the rating badge", () => {
    expect(renderToStaticMarkup(<PhotoRatingBadge rating={4} reviews={2} />)).toContain(GLASS);
  });
});
