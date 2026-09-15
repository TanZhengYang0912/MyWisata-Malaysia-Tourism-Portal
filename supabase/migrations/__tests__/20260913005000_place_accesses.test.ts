import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260913005000_place_accesses.sql");

describe("place accesses migration", () => {
  it("stores source-backed public access separately from vendor commerce", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE public.place_accesses");
    expect(migration).toContain("place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE");
    expect(migration).toContain("access_type TEXT NOT NULL CHECK (access_type IN ('free_public_access', 'free_activity'))");
    expect(migration).toContain("source_url TEXT NOT NULL CHECK (source_url ~ '^https://')");
    expect(migration).toContain("image_source_url TEXT");
    expect(migration).toContain("UNIQUE (place_id, slug)");
    expect(migration).toContain("CREATE POLICY place_accesses_public_read");
    expect(migration).toContain("is_admin(auth.uid())");
  });
});
