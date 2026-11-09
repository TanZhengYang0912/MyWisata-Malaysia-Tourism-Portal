import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const read = (file: string) => readFileSync(resolve(workspace, file), "utf8");

describe("shared card layout contract", () => {
  it("defines stable media, title, metadata, body, and footer slots", () => {
    const styles = read("app/globals.css");

    expect(styles).toContain(".mw-card {");
    expect(styles).toContain(".mw-card-media {");
    expect(styles).toContain(".mw-card-body {");
    expect(styles).toContain(".mw-card-title {");
    expect(styles).toContain(".mw-card-meta {");
    expect(styles).toContain(".mw-card-footer {");
  });

  it("keeps media consumer backgrounds from being overwritten", () => {
    const styles = read("app/globals.css");
    const mediaRule = styles.match(/\.mw-card-media\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(mediaRule).toContain("background-color: var(--secondary);");
    expect(mediaRule).not.toContain("background: var(--secondary);");
  });

  it("uses the shared CardFrame across customer-facing card families", () => {
    for (const file of ["components/customer/product-card.tsx", "components/customer/vendor-card.tsx", "components/customer/outlet-card.tsx", "components/customer/place-activity-card.tsx"]) {
      expect(read(file), file).toContain("<CardFrame");
    }
    expect(read("components/customer/vendor-listing-grid.tsx")).toContain("ProductCard");
    expect(read("app/customer/for-you/for-you-client.tsx")).toContain("ActivityCard");
    expect(read("app/customer/search/search-client.tsx")).toContain("items-stretch");
  });
});
