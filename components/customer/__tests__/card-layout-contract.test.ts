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

    expect(styles).toContain("background-color: var(--secondary);");
    expect(styles).not.toContain("  background: var(--secondary);");
  });

  it("uses the contract across customer-facing card families", () => {
    const cardConsumers = [
      "components/customer/activity-card.tsx",
      "components/guest/guest-catalogue.tsx",
      "app/customer/for-you/for-you-client.tsx",
      "app/customer/vendor/[vendorId]/page.tsx",
    ];

    for (const file of cardConsumers) {
      if (file === "app/customer/for-you/for-you-client.tsx") {
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
