import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/customer/media-gallery.tsx"), "utf8");

describe("customer media gallery contract", () => {
  it("supports touch scrolling, keyboard navigation, and labelled slide state", () => {
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("snap-x");
    expect(source).toContain("scrollTo");
    expect(source).toContain("aria-roledescription=\"carousel\"");
    expect(source).toContain("aria-live=\"polite\"");
    expect(source).toContain("ArrowLeft");
    expect(source).toContain("ArrowRight");
  });

  it("keeps public galleries visually restrained and lazy-loads later slides", () => {
    expect(source).toContain("h-[240px]");
    expect(source).toContain("sm:h-[320px]");
    expect(source).toContain("lg:h-[400px]");
    expect(source).toContain('loading={index === 0 ? "eager" : "lazy"}');
  });
});
