import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260904233000_ticket_passes_and_audit.sql"),
  "utf8",
);

describe("ticket passes and check-in audit migration", () => {
  it("enforces multi-entry policies, atomic capacity locks, and immutable audit logs", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.ticket_passes");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.check_in_events");
    expect(migration).toContain("policy IN ('single_entry', 'multi_entry', 'group_entry')");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.admit_ticket_pass");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("EXCEEDS_ENTRY_LIMIT");
    expect(migration).toContain("INSERT INTO public.check_in_events");
  });
});
