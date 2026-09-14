import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260913103000_place_activity_media_paths.sql"), "utf8");

describe("place activity media paths migration", () => {
  it("keeps bucket asset paths separate from their audit source URLs", () => {
    expect(migration).toContain("ALTER TABLE public.place_accesses");
    expect(migration).toContain("ALTER TABLE public.place_informational_activities");
    expect(migration.match(/ADD COLUMN image_path TEXT/g)).toHaveLength(2);
    expect(migration).toContain("^activity-media/[a-z0-9-]+\\.webp$");
    expect(migration).toContain("image_source_url");
  });
});
