import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HomeDestinationWormIndicator } from "@/components/customer/home-destination-worm-indicator";

describe("HomeDestinationWormIndicator", () => {
  it("renders accessible page controls with the active worm position", () => {
    const markup = renderToStaticMarkup(
      <HomeDestinationWormIndicator
        count={4}
        progress={1}
        current={1}
        sizes={{ dot: 16, pill: 58, gap: 13 }}
        label="Destination carousel controls"
        pageLabel={(page, count) => `Page ${page} of ${count}`}
        onSelect={vi.fn()}
      />,
    );

    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="Destination carousel controls"');
    expect(markup.match(/<button/g)).toHaveLength(4);
    expect(markup).toContain('aria-label="Page 2 of 4"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain("width:16px;height:16px");
    expect(markup).toContain("width:58px;height:16px");
    expect(markup).toContain('left:29px;width:58px');
    expect(markup).not.toContain("justify-center");
  });

  it("draws the card-carousel dots: a navy pill over grey bars that turn yellow on hover or press", () => {
    const markup = renderToStaticMarkup(
      <HomeDestinationWormIndicator
        appearance="dots"
        count={3}
        progress={0}
        current={0}
        sizes={{ dot: 6, pill: 14, gap: 18 }}
        label="Featured highlights"
        pageLabel={(page, count) => `Page ${page} of ${count}`}
        onSelect={vi.fn()}
      />,
    );
    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(markup).toContain("bg-primary");
    expect(markup).toContain("bg-muted-foreground/35");
    expect(markup).toContain("hover:bg-accent");
    expect(markup).not.toContain("#f4bd00");
    // The current page's own bar is clear, so the grey never covers the pill.
    expect(markup.match(/bg-muted-foreground\/35/g)).toHaveLength(2);
  });
});
