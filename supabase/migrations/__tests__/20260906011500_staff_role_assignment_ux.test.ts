import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260906011500_staff_role_assignment_ux.sql",
);

function migrationSql() {
  expect(existsSync(migrationPath), "staff role assignment UX migration must exist").toBe(true);
  return readFileSync(migrationPath, "utf8");
}

function functionSql(sql: string, name: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + 1);
  return sql.slice(start, next === -1 ? undefined : next);
}

describe("staff role assignment UX migration", () => {
  it("limits custom role names to 20 and descriptions to 100 without invalidating system roles", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/CHECK\s*\(\s*is_system\s+OR[\s\S]*?char_length\(BTRIM\(name\)\)\s+BETWEEN\s+1\s+AND\s+20/i);
    expect(sql).toMatch(/CHECK\s*\(\s*is_system\s+OR[\s\S]*?description\s+IS\s+NULL[\s\S]*?char_length\(BTRIM\(description\)\)\s*<=\s*100/i);
  });

  it("allows system templates to be assigned and revoked without making their definitions editable", () => {
    const sql = migrationSql();
    const assignSql = functionSql(sql, "assign_staff_role");
    const revokeSql = functionSql(sql, "revoke_staff_role_assignment");

    expect(assignSql).not.toContain("system_role_protected");
    expect(revokeSql).not.toContain("system_role_protected");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.update_staff_role");
  });

  it("preserves governed target eligibility and transactional audit records", () => {
    const sql = migrationSql();
    const assignSql = functionSql(sql, "assign_staff_role");
    const revokeSql = functionSql(sql, "revoke_staff_role_assignment");

    expect(assignSql).toContain("require_active_global_staff_super_admin");
    expect(assignSql).toMatch(/target_user\.status\s*=\s*'active'/i);
    expect(assignSql).toMatch(/legacy_role\.name\s+IN\s+\('admin',\s*'approver',\s*'super_admin'\)/i);
    expect(assignSql).toContain("staff.role.assigned");
    expect(revokeSql).toContain("require_active_global_staff_super_admin");
    expect(revokeSql).toContain("staff.role.revoked");
  });

  it("limits direct Staff RBAC reads to active global Super Admins", () => {
    const sql = migrationSql();

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.is_active_global_staff_super_admin");
    expect(sql).toMatch(/actor\.status\s*=\s*'active'/i);
    expect(sql).toMatch(/assignment\.vendor_id\s+IS\s+NULL[\s\S]*?assignment\.outlet_id\s+IS\s+NULL/i);
    for (const policy of [
      "staff_permissions_super_admin_read",
      "staff_roles_super_admin_read",
      "staff_role_permissions_super_admin_read",
      "staff_role_assignments_super_admin_read",
    ]) {
      expect(sql).toMatch(new RegExp(
        `CREATE POLICY ${policy}[\\s\\S]+?is_active_global_staff_super_admin\\(auth\\.uid\\(\\)\\)`,
        "i",
      ));
    }
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.is_active_global_staff_super_admin\(UUID\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.is_active_global_staff_super_admin\(UUID\) TO authenticated, service_role/i);
  });
});
