import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260905073500_staff_permission_enforcement.sql",
);

function migrationSql() {
  expect(existsSync(migrationPath), "staff permission enforcement migration must exist").toBe(true);
  return readFileSync(migrationPath, "utf8");
}

function functionSql(sql: string, name: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + 1);
  return sql.slice(start, next === -1 ? undefined : next);
}

describe("staff permission enforcement migration", () => {
  it("removes the legacy all-access Vendor policy and restores read-only access", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/DROP POLICY IF EXISTS\s+["']?demo_allow_all["']?\s+ON public\.vendors/i);
    expect(sql).toMatch(/REVOKE\s+(?:INSERT,\s*UPDATE,\s*DELETE|ALL)\s+ON TABLE public\.vendors FROM authenticated/i);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.vendors TO anon, authenticated/i);
    expect(sql).toMatch(/CREATE POLICY\s+vendors_read_only_access\s+ON public\.vendors\s+FOR SELECT/i);
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]+?ON public\.vendors\s+FOR (?:ALL|UPDATE|INSERT|DELETE)/i);
  });

  it("exposes transactional review and suspension RPCs with an internal permission guard", () => {
    const sql = migrationSql();

    for (const name of ["staff_review_vendor", "staff_set_vendor_suspension"]) {
      const body = functionSql(sql, name);
      expect(body).toContain("SECURITY DEFINER");
      expect(body).toContain("SET search_path = public, pg_temp");
      expect(body).toMatch(/has_staff_permission\s*\(\s*v_actor_id,\s*'admin\.vendor\.manage'\s*\)/i);
      expect(body).toMatch(/FOR UPDATE/i);
      expect(body).toContain("vendor_permission_required");
    }

    expect(functionSql(sql, "staff_review_vendor")).toMatch(/admin_approve_claimed_vendor\s*\(\s*p_vendor_id\s*\)/i);
    expect(functionSql(sql, "staff_review_vendor")).toMatch(/UPDATE public\.vendors[\s\S]+status\s*=\s*'rejected'/i);
    expect(functionSql(sql, "staff_set_vendor_suspension")).toMatch(/UPDATE public\.vendors[\s\S]+status\s*=\s*v_new_status/i);
  });

  it("allows authenticated execution only through the secured RPCs", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.staff_review_vendor\(UUID, TEXT, TEXT\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.staff_review_vendor\(UUID, TEXT, TEXT\) TO authenticated, service_role/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.staff_set_vendor_suspension\(UUID, TEXT, TEXT\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.staff_set_vendor_suspension\(UUID, TEXT, TEXT\) TO authenticated, service_role/i);
  });
});
