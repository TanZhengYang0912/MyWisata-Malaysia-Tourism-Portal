import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/legacy-migrations/20260731224343_canonical_discovery_categories.sql";

describe("canonical discovery category migration contract", () => {
  it("normalizes the four real categories and retains legacy rows", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("slug = 'activity'");
    expect(sql).toContain("slug = 'retail'");
    expect(sql).toContain("SET name = 'Food'");
    expect(sql).toContain("SET name = 'Accommodation'");
    expect(sql).toContain("SET is_active = FALSE");
    expect(sql).toContain("UPDATE products");
    expect(sql).toContain("UPDATE vendor_recommendations");
  });

  it("does not create Hidden Gem as a database category", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).not.toContain("slug = 'hidden_gem'");
    expect(sql).not.toContain("'Hidden Gem', 'hidden_gem'");
  });
});
