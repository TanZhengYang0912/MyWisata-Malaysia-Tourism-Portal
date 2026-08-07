import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const seedSource = readFileSync(resolve(process.cwd(), "scripts/seed-remote-demo.mjs"), "utf8");
const repairSource = readFileSync(resolve(process.cwd(), "scripts/repair-demo-vendor-media.mjs"), "utf8");

describe("demo vendor image seed contract", () => {
  it("does not seed stock photos as vendor identity media", () => {
    expect(seedSource).toContain("logo_url: null");
    expect(seedSource).toContain("cover_url: null");
    expect(seedSource).not.toContain("logo_url: PHOTO_URLS[0]");
    expect(seedSource).not.toContain("cover_url: PHOTO_URLS[4]");
    expect(seedSource).not.toContain("logo_url: PHOTO_URLS[2]");
    expect(seedSource).not.toContain("cover_url: PHOTO_URLS[6]");
  });

  it("repairs only the known demo vendor slugs", () => {
    for (const slug of ["rasa-malaysia", "batik-nusantara", "borneo-wild"]) {
      expect(repairSource).toContain(`'${slug}'`);
    }
    expect(repairSource).toContain("update({ logo_url: null, cover_url: null })");
  });
});
