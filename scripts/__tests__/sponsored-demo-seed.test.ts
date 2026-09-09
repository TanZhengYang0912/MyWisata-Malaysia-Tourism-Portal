import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

describe("sponsored discovery demo seed", () => {
  it("is explicit, guarded, eligible-only, bounded, and idempotent", () => {
    const source = readFileSync(resolve(root, "scripts/seed-sponsored-demo.mjs"), "utf8");

    expect(packageJson.scripts["seed:sponsored-demo"]).toBe(
      "SPONSORED_DEMO_SEED=1 node scripts/seed-sponsored-demo.mjs",
    );
    expect(source).toContain('process.env.SPONSORED_DEMO_SEED !== "1"');
    expect(source).toContain('.eq("status", "active")');
    expect(source).toContain('.eq("review_status", "approved")');
    expect(source).toContain('select("id,name,outlet_id,outlet_offers(outlet_id,status)")');
    expect(source).toContain('product.outlet_id || product.outlet_offers?.some((offer) => offer.status === "active")');
    expect(source).toContain(".slice(0, MAX_DEMO_PLACEMENTS)");
    expect(source).toContain('stableUuid(`sponsored-demo:${product.id}`)');
    expect(source).toContain('onConflict: "id"');
    expect(source).toContain('status: "approved"');
    expect(source).toContain("starts_at:");
    expect(source).toContain("ends_at:");
  });
});
