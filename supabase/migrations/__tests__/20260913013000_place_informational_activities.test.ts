import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260913013000_place_informational_activities.sql");

describe("place informational activities migration", () => {
  it("keeps source-backed paid attraction information outside vendor commerce", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE public.place_informational_activities");
    expect(migration).toContain("place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE");
    expect(migration).toContain("activity_type TEXT NOT NULL CHECK (activity_type IN ('informational_activity', 'informational_paid_activity'))");
    expect(migration).toContain("price_label TEXT");
    expect(migration).toContain("activity_type <> 'informational_paid_activity' OR length(trim(price_label)) > 0");
    expect(migration).toContain("source_url TEXT NOT NULL CHECK (source_url ~ '^https://')");
    expect(migration).toContain("UNIQUE (place_id, slug)");
    expect(migration).toContain("CREATE POLICY place_informational_activities_public_read");
    expect(migration).not.toContain("vendor_id");
    expect(migration).not.toContain("outlet_id");
  });
});
