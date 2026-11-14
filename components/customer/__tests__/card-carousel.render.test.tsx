import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { CardCarousel } from "@/components/customer/card-carousel";

describe("CardCarousel", () => {
  it("names a focusable track, wraps every card and shows no arrows for a single page", () => {
    // Without a DOM the pager reports one page.
    const markup = renderToStaticMarkup(<CardCarousel label="Featured highlights">{[<article key="a">A</article>, <article key="b">B</article>]}</CardCarousel>);
    expect(markup).toContain('class="mw-card-carousel" tabindex="0" aria-label="Featured highlights"');
    expect(markup.match(/<div><article>/g)).toHaveLength(2);
    expect(markup).not.toContain("<button");
  });

  it("keeps arrows navy at rest, yellow on hover, beside the photos from 1360px, and uses the dots worm", () => {
    const source = readFileSync(resolve(process.cwd(), "components/customer/card-carousel.tsx"), "utf8");
    expect(source).toContain("hover:text-accent");
    expect(source).toContain("disabled:text-primary/20");
    expect(source).toContain("min-[1360px]:absolute");
    expect(source).toContain('appearance="dots"');
    expect(source).toContain("{ verticalWheel: false }");
  });
});
