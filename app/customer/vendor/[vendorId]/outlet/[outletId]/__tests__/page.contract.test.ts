import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "app/customer/vendor/[vendorId]/outlet/[outletId]/page.tsx"),
  "utf8",
);

describe("customer public outlet media hierarchy", () => {
  it("removes the hero image from the gallery before rendering the public document", () => {
    expect(pageSource).toContain("const availableGallery = gallery.length ? gallery : document.gallery;");
    expect(pageSource).toContain("const heroImageUrl = gallery[0]?.url || document.hero.imageUrl || document.gallery[0]?.url;");
    expect(pageSource).toContain("availableGallery.filter((item) => item.url !== heroImageUrl)");
  });
});
