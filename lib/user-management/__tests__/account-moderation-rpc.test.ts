import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/legacy-migrations/055_admin_account_lifecycle_context.sql");

describe("admin account lifecycle RPC patch", () => {
  it("sets the server-managed lifecycle context before status mutations", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("set_config('app.allow_account_status_write', 'on', true)");
    expect(sql).toContain("set_config('app.allow_verification_write', 'on', true)");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_manage_user(");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_manage_user(UUID, UUID, TEXT, TEXT) TO service_role");
  });
});
