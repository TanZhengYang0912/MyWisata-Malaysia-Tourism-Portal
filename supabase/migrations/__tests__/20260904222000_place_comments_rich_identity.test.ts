import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260904222000_place_comments_rich_identity.sql",
);

describe("place comments rich identity migration", () => {
  it("adds is_anonymous column to place_comments", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("ALTER TABLE public.place_comments");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false");
    expect(migration).toContain("idx_place_comments_anonymous");
  });
});
