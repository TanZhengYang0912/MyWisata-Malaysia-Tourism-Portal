import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260816062923_remaining_outlet_manager_accounts.sql",
);

describe("remaining outlet manager accounts migration", () => {
  it("assigns every outlet missing a manager, computed once via a temp table", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TEMP TABLE outlets_needing_manager");
    expect(migration).toContain("md5('outlet-manager:' || slug)::uuid");
    expect(migration).toContain("INSERT INTO public.outlet_managers (user_id, outlet_id)");
    expect(migration).toContain("INSERT INTO public.user_roles (user_id, role_id, vendor_id, outlet_id)");
    expect(migration).toContain("RAISE EXCEPTION");
    expect(migration).toContain("BEGIN;");
    expect(migration).toContain("COMMIT;");
  });
});
