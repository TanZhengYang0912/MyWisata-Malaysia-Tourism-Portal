import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260912210000_place_community_mock_data_v2.sql",
);

describe("place community mock-data follow-up migration", () => {
  it("covers every active place with varied, idempotent notes without touching user notes", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("FROM public.places");
    expect(migration).toContain("WHERE status = 'active'");
    expect(migration).toContain("place_comments");
    expect(migration).toContain("md5(format('place-community:%s:%s'");
    expect(migration).toContain("body LIKE 'Sample local tip for %'");
    expect(migration).toContain("is_anonymous");
    expect(migration).toContain("ON CONFLICT (id) DO UPDATE");
    expect(migration).toContain("customer_ids[scenario + 1]");
    expect(migration).not.toContain("DELETE FROM public.place_comments");
  });
});
