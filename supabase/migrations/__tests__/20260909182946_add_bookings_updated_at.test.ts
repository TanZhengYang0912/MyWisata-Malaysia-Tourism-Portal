import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260909182946_add_bookings_updated_at.sql",
);

function migrationSql() {
  expect(existsSync(migrationPath), "bookings timestamp migration must exist").toBe(true);
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}

describe("bookings updated_at compatibility migration", () => {
  it("adds the timestamp required by the check-in RPC", () => {
    const sql = migrationSql();

    expect(sql).toMatch(
      /ALTER TABLE public\.bookings[\s\S]+ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/i,
    );
  });
});
