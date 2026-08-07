import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260805010000_mark_public_walks_free.sql";

describe("public walk pricing migration contract", () => {
  it("resets only the known public walks to free and non-bookable", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("requires_booking = FALSE");
    expect(sql).toContain("base_price = 0");
    for (const slug of [
      "george-town-story-walk-penang",
      "jonker-walk-heritage-trail",
      "merdeka-square-heritage-walk",
    ]) {
      expect(sql).toContain(`'${slug}'`);
    }
  });

  it("does not delete booking history or change the schema", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).not.toMatch(/^\s*delete\s+/m);
    expect(sql).not.toMatch(/^\s*alter\s+table\s+/m);
    expect(sql).not.toMatch(/^\s*drop\s+/m);
  });
});
