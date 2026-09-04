import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260904210000_place_comments.sql"),
  "utf8",
);

describe("place comments migration", () => {
  it("keeps public discussion separate from purchase reviews and read-only for browser roles", () => {
    expect(migration).toContain("CREATE TABLE public.place_comments");
    expect(migration).toContain("REFERENCES public.places(id)");
    expect(migration).toContain("REFERENCES public.users(id)");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FOR SELECT TO anon, authenticated");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON TABLE public.place_comments FROM anon, authenticated");
    expect(migration).toContain("CREATE INDEX idx_place_comments_place_created");
  });
});
