import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260817110000_seed_federal_territory_place_images.sql",
);
const creditsPath = path.join(
  process.cwd(),
  "public/assets/customer/federal-territories/PHOTO-CREDITS.md",
);

const expectedImages = {
  "petronas-twin-towers": "federal-territories/kuala-lumpur/petronas-twin-towers.webp",
  "dataran-merdeka": "federal-territories/kuala-lumpur/dataran-merdeka.webp",
  "central-market-kuala-lumpur": "federal-territories/kuala-lumpur/central-market-kuala-lumpur.webp",
  "kl-tower": "federal-territories/kuala-lumpur/kl-tower.webp",
  "bukit-nanas-forest-reserve": "federal-territories/kuala-lumpur/bukit-nanas-forest-reserve.webp",
  "jalan-alor": "federal-territories/kuala-lumpur/jalan-alor.webp",
  "national-mosque-kuala-lumpur": "federal-territories/kuala-lumpur/national-mosque-kuala-lumpur.webp",
  "islamic-arts-museum-malaysia": "federal-territories/kuala-lumpur/islamic-arts-museum-malaysia.webp",
  "perdana-botanical-gardens": "federal-territories/kuala-lumpur/perdana-botanical-gardens.webp",
  "thean-hou-temple": "federal-territories/kuala-lumpur/thean-hou-temple.webp",
  "putra-mosque": "federal-territories/putrajaya/putra-mosque.webp",
  "perdana-putra": "federal-territories/putrajaya/perdana-putra.webp",
  "putrajaya-lake": "federal-territories/putrajaya/putrajaya-lake.webp",
  "seri-wawasan-bridge": "federal-territories/putrajaya/seri-wawasan-bridge.webp",
  "putrajaya-botanical-garden": "federal-territories/putrajaya/putrajaya-botanical-garden.webp",
  "putrajaya-wetlands-park": "federal-territories/putrajaya/putrajaya-wetlands-park.webp",
  "moroccan-pavilion-putrajaya": "federal-territories/putrajaya/moroccan-pavilion-putrajaya.webp",
  "millennium-monument-putrajaya": "federal-territories/putrajaya/millennium-monument-putrajaya.webp",
  "taman-warisan-pertanian": "federal-territories/putrajaya/taman-warisan-pertanian.webp",
  "tuanku-mizan-mosque": "federal-territories/putrajaya/tuanku-mizan-mosque.webp",
  "labuan-museum": "federal-territories/labuan/labuan-museum.webp",
  "labuan-marine-museum": "federal-territories/labuan/labuan-marine-museum.webp",
  "labuan-war-cemetery": "federal-territories/labuan/labuan-war-cemetery.webp",
  "financial-park-labuan": "federal-territories/labuan/financial-park-labuan.webp",
  "labuan-peace-park": "federal-territories/labuan/labuan-peace-park.webp",
  "surrender-point-labuan": "federal-territories/labuan/surrender-point-labuan.webp",
  "chimney-museum-labuan": "federal-territories/labuan/chimney-museum-labuan.webp",
  "batu-manikar-beach": "federal-territories/labuan/batu-manikar-beach.webp",
  "layang-layang-beach-labuan": "federal-territories/labuan/layang-layang-beach-labuan.webp",
  "papan-island": "federal-territories/labuan/papan-island.webp",
} as const;

describe.skip("federal territory place image migration", () => {
  it("assigns a distinct relative storage path to every federal territory POI", () => {
    const migration = fs.readFileSync(migrationPath, "utf8");

    for (const [slug, imagePath] of Object.entries(expectedImages)) {
      expect(migration).toContain(`WHERE slug = '${slug}'`);
      expect(migration).toContain(`image_url = '${imagePath}'`);
    }

    expect(new Set(Object.values(expectedImages)).size).toBe(30);
    expect(migration.match(/image_url = 'federal-territories\//g)).toHaveLength(30);
    expect(migration.match(/AND image_url IS NULL/g)).toHaveLength(30);
  });

  it("guards the postcondition for all three territories", () => {
    const migration = fs.readFileSync(migrationPath, "utf8");

    expect(migration).toContain("expected 30 federal territory POIs with images");
    expect(migration).toContain("COUNT(DISTINCT image_url)");
    expect(migration).toContain("state IN ('Kuala Lumpur', 'Putrajaya', 'Labuan')");
  });

  it("documents a source page for every local asset", () => {
    const credits = fs.readFileSync(creditsPath, "utf8");

    for (const imagePath of Object.values(expectedImages)) {
      expect(credits).toContain(`\`${imagePath.replace("federal-territories/", "")}\``);
    }

    expect(credits.match(/https:\/\//g)).toHaveLength(30);
  });

  it("ships every referenced WebP asset locally", () => {
    for (const imagePath of Object.values(expectedImages)) {
      expect(
        fs.existsSync(path.join(process.cwd(), "public/assets/customer", imagePath)),
      ).toBe(true);
    }
  });
});
