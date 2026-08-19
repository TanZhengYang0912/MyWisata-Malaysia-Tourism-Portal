import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260817090000_seed_federal_territories.sql"),
  "utf8",
);

const stateSlugs = ["kuala-lumpur", "putrajaya", "labuan"];
const poiSlugs = [
  "petronas-twin-towers",
  "bukit-nanas-forest-reserve",
  "dataran-merdeka",
  "central-market-kuala-lumpur",
  "kl-tower",
  "perdana-botanical-gardens",
  "national-mosque-kuala-lumpur",
  "thean-hou-temple",
  "jalan-alor",
  "islamic-arts-museum-malaysia",
  "putra-mosque",
  "perdana-putra",
  "putrajaya-lake",
  "seri-wawasan-bridge",
  "putrajaya-botanical-garden",
  "putrajaya-wetlands-park",
  "moroccan-pavilion-putrajaya",
  "millennium-monument-putrajaya",
  "taman-warisan-pertanian",
  "tuanku-mizan-mosque",
  "labuan-museum",
  "labuan-marine-museum",
  "labuan-war-cemetery",
  "labuan-peace-park",
  "surrender-point-labuan",
  "chimney-museum-labuan",
  "papan-island",
  "layang-layang-beach-labuan",
  "batu-manikar-beach",
  "financial-park-labuan",
];

describe("federal territory place seed", () => {
  it("defines all three state roots and keeps the migration rerunnable", () => {
    for (const slug of stateSlugs) {
      expect(migrationSource).toContain(`'${slug}'`);
    }

    expect(migrationSource).toContain("ON CONFLICT (slug) DO NOTHING");
    expect(migrationSource).toContain("expected 3 federal territory states");
    expect(migrationSource).toContain("expected 30 federal territory POIs");
  });

  it("defines thirty distinct POI slugs for the shared listing UI", () => {
    expect(new Set(poiSlugs).size).toBe(30);
    for (const slug of poiSlugs) {
      expect(migrationSource).toContain(`'${slug}'`);
    }
  });
});
