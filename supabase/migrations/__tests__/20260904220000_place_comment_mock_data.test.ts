import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260904220000_place_comment_mock_data.sql",
);

describe("place comment mock-data migration", () => {
  it("seeds every active state, region, and POI as Customer Alice without duplicating her note", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("customer1@demo.local");
    expect(migration).toContain("aaaaaaaa-0000-0000-0000-000000000005");
    expect(migration).toContain("FROM public.places AS place");
    expect(migration).toContain("place.status = 'active'");
    expect(migration).toContain("INSERT INTO public.place_comments");
    expect(migration).toContain("NOT EXISTS");
    expect(migration).toContain("comment.user_id = customer_id");
    expect(migration).toContain("'published'");
  });
});
