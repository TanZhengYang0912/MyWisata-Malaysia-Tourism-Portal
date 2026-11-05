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

  it("lets the activity-card detail region expand and stacks its price and CTA", () => {
    const styles = read("app/globals.css");

    expect(styles).toContain(".mw-card-footer-stacked {");
    expect(styles).toContain(".mw-card-details-expand {");
    expect(styles).toContain(".mw-card-expand-card:focus-within .mw-card-details-expand");
    expect(styles).toContain("prefers-reduced-motion: reduce");
  });

  it("floats the opened activity-card drawer over the next row instead of growing the grid row", () => {
    const styles = read("app/globals.css");
    const cardRule = styles.match(/\.mw-card-expand-card \{([^}]*)\}/)?.[1] ?? "";
    const rowRule = styles.match(/\.mw-card-expand-card \.mw-card-cta-row \{([^}]*)\}/)?.[1] ?? "";
    const drawerRule = styles.match(/\.mw-card-expand-card \.mw-card-cta-drawer \{([^}]*)\}/)?.[1] ?? "";

    expect(cardRule).toContain("overflow: visible");
    expect(rowRule).toContain("height: 2.25rem");
    expect(drawerRule).toContain("position: absolute");
    expect(drawerRule).toMatch(/^\s*top: 0;/m);
  });

  it("keeps closed drawer details readable by screen readers (collapsed, not visibility: hidden)", () => {
    const styles = read("app/globals.css");
    const closedRule = styles.match(/\.mw-card-details-expand \{([^}]*)\}/)?.[1] ?? "";

    expect(closedRule).toContain("grid-template-rows: 0fr");
    expect(closedRule).toContain("opacity: 0");
    expect(closedRule).not.toContain("visibility");
  });

  it("styles a tap-opened card like a hovered one", () => {
    const styles = read("app/globals.css");
    expect(styles).not.toContain("@media (hover: none) {");
    expect(styles).toContain('.mw-card-expand-card[data-open="true"] .mw-card-details-expand');
  });

  it("gives an opened two-line name room without moving the grid row", () => {
    const styles = read("app/globals.css");
    const compactRule = styles.match(/\.mw-card-body-compact \{([^}]*)\}/)?.[1] ?? "";
    const wrapsRule = styles.match(/\.mw-card-expand-card\[data-title-wraps="true"\]\[data-open="true"\] \{([^}]*)\}/)?.[1] ?? "";
    const hoverBlock = styles.slice(styles.indexOf("@media (hover: hover) and (pointer: fine)"));

    expect(compactRule).toContain("min-height: 0;");
    expect(wrapsRule).toContain("height: calc(100% + var(--mw-card-title-lh));");
    expect(wrapsRule).toContain("margin-bottom: calc(-1 * var(--mw-card-title-lh));");
    expect(styles.indexOf(".mw-card-expand-card:hover .mw-card-title")).toBeGreaterThan(styles.indexOf("@media (hover: hover) and (pointer: fine)"));
    expect(hoverBlock).toContain('.mw-card-expand-card[data-title-wraps="true"]:hover {');
  });

  it("keeps media consumer backgrounds from being overwritten", () => {
    const styles = read("app/globals.css");
    const mediaRule = styles.match(/\.mw-card-media\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(mediaRule).toContain("background-color: var(--secondary);");
    expect(mediaRule).not.toContain("background: var(--secondary);");
  });

  it("uses the contract across customer-facing card families", () => {
    const cardConsumers = [
      "components/customer/activity-card.tsx",
      "components/guest/guest-catalogue.tsx",
      "app/customer/for-you/for-you-client.tsx",
      "components/customer/vendor-listing-grid.tsx",
    ];

    for (const file of cardConsumers) {
      if (file === "app/customer/for-you/for-you-client.tsx" || file === "components/customer/vendor-listing-grid.tsx") {
        expect(read(file), file).toContain("ActivityCard");
      } else {
        expect(read(file), file).toContain("mw-card");
      }
    }

    expect(read("app/customer/home-client.tsx")).toContain("items-stretch");
    expect(read("app/customer/search/search-client.tsx")).toContain("items-stretch");
    expect(read("components/customer/malaysia-destination-rail.tsx")).toContain("h-[285px]");
    expect(read("components/customer/malaysia-destination-rail.tsx")).toContain("sm:h-[350px]");
  });
});
