import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = resolve(__dirname, "../../..");
const migrationPath = resolve(workspace, "supabase/migrations/20260816230000_fill_remaining_place_images.sql");
const creditsPath = resolve(workspace, "public/assets/customer/PHOTO-CREDITS.md");

function collectWebpFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    return entry.isDirectory()
      ? collectWebpFiles(entryPath)
      : entry.name.endsWith(".webp")
        ? [entryPath]
        : [];
  });
}

const expected = [
  ["danga-bay-waterfront", "johor/danga-bay-waterfront.webp"],
  ["legoland-waterpark", "johor/legoland-waterpark.webp"],
  ["muar", "johor/muar.webp"],
  ["johor", "johor/johor.webp"],
  ["jetty-point-kuah", "kedah/jetty-point-kuah.webp"],
  ["tanjung-rhu", "kedah/tanjung-rhu.webp"],
  ["kedah", "kedah/kedah.webp"],
  ["pantai-nami", "kelantan/pantai-nami.webp"],
  ["muzium-kota-lukut", "negeri-sembilan/muzium-kota-lukut.webp"],
  ["ns-chinese-assembly-hall", "negeri-sembilan/ns-chinese-assembly-hall.webp"],
  ["bishops-trail", "pahang/bishops-trail.webp"],
  ["cherating-beach", "pahang/cherating-beach.webp"],
  ["cherating-turtle-sanctuary", "pahang/cherating-turtle-sanctuary.webp"],
  ["juara-beach", "pahang/juara-beach.webp"],
  ["lata-berkoh", "pahang/lata-berkoh.webp"],
  ["sungai-palas-tea-estate", "pahang/sungai-palas-tea-estate.webp"],
  ["tioman-marine-park", "pahang/tioman-marine-park.webp"],
  ["taiping-zoo", "perak/taiping-zoo.webp"],
  ["dataran-keris", "perlis/dataran-keris.webp"],
  ["taman-ular-dan-reptilia", "perlis/taman-ular-dan-reptilia.webp"],
  ["pusat-orkid", "sabah/pusat-orkid.webp"],
  ["kuching-waterfront-bazaar", "sarawak/kuching-waterfront-bazaar.webp"],
  ["satok-market", "sarawak/satok-market.webp"],
  ["upside-down-house", "sarawak/upside-down-house.webp"],
  ["dataran-bunga-raya", "selangor/dataran-bunga-raya.webp"],
  ["merang-jetty", "terengganu/merang-jetty.webp"],
  ["turtle-alley", "terengganu/turtle-alley.webp"],
  ["merang", "terengganu/merang.webp"],
] as const;

describe.skip("remaining place image completion", () => {
  it("assigns a distinct real asset to every currently empty place", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(creditsPath)).toBe(true);

    const migration = readFileSync(migrationPath, "utf8");
    const credits = readFileSync(creditsPath, "utf8");

    for (const [slug, objectPath] of expected) {
      expect(migration).toContain(`WHERE slug = '${slug}'`);
      expect(migration).toContain(`SET image_url = '${objectPath}'`);
      expect(existsSync(resolve(workspace, "public/assets/customer", objectPath))).toBe(true);
      expect(credits).toContain(objectPath);
    }

    expect(new Set(expected.map(([, objectPath]) => objectPath)).size).toBe(expected.length);
    const allAssetPaths = collectWebpFiles(resolve(workspace, "public/assets/customer"));
    const allHashes = allAssetPaths.map((assetPath) =>
      createHash("sha256").update(readFileSync(assetPath)).digest("hex"),
    );
    const expectedHashes = expected.map(([, objectPath]) =>
      createHash("sha256")
        .update(readFileSync(resolve(workspace, "public/assets/customer", objectPath)))
        .digest("hex"),
    );
    expect(new Set(expectedHashes).size).toBe(expected.length);
    for (const hash of expectedHashes) {
      expect(allHashes.filter((assetHash) => assetHash === hash)).toHaveLength(1);
    }
    expect(migration).toContain("AND image_url IS NULL");
    expect(credits).toContain("Source");
    expect(credits).toContain("License / note");
  });
});
