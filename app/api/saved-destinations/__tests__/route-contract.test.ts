import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260804230000_saved_destinations.sql");
const routePath = resolve(process.cwd(), "app/api/saved-destinations/route.ts");

describe("saved destination persistence contract", () => {
  it("has an ownership-protected table and authenticated API route", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(routePath)).toBe(true);

    const migration = readFileSync(migrationPath, "utf8");
    const route = readFileSync(routePath, "utf8");
    expect(migration).toContain("customer_saved_destinations");
    expect(migration).toContain("UNIQUE (user_id, destination_state)");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("GRANT SELECT, INSERT, DELETE");
    expect(route).toContain("destination_state");
    expect(route).toContain("MALAYSIA_DESTINATIONS");
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
    expect(route).toContain("export async function DELETE");
  });
});
