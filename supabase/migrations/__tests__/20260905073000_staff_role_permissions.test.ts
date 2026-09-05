import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260905073000_staff_role_permissions.sql",
);

function migrationSql() {
  expect(existsSync(migrationPath), "staff RBAC migration must exist").toBe(true);
  return readFileSync(migrationPath, "utf8");
}

function normalizedSql(sql: string) {
  return sql.replace(/\s+/g, " ");
}

describe("dedicated staff role permissions migration", () => {
  it("creates normalized staff RBAC tables with the required constraints", () => {
    const sql = migrationSql();

    for (const table of [
      "staff_permissions",
      "staff_roles",
      "staff_role_permissions",
      "staff_role_assignments",
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\s*\\(`, "i"));
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
    }

    expect(sql).toMatch(/staff_permissions[\s\S]+?id\s+UUID\s+PRIMARY KEY[\s\S]+?key\s+TEXT\s+UNIQUE/i);
    expect(sql).toMatch(/staff_roles[\s\S]+?created_by\s+UUID\s+REFERENCES public\.users\(id\)/i);
    expect(sql).toContain("REFERENCES public.staff_roles(id) ON DELETE CASCADE");
    expect(sql).toContain("REFERENCES public.staff_permissions(id) ON DELETE RESTRICT");
    expect(sql).toMatch(/staff_role_permissions[\s\S]+?PRIMARY KEY\s*\(role_id, permission_id\)/i);
    expect(sql).toContain("REFERENCES public.users(id) ON DELETE CASCADE");
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS staff_role_assignments_live_unique[\s\S]+?ON public\.staff_role_assignments\s*\(role_id, user_id\)[\s\S]+?WHERE revoked_at IS NULL/i);
  });

  it("seeds only the four approved permission keys and immutable legacy role mappings", () => {
    const sql = migrationSql();

    for (const key of [
      "admin.kyc.review",
      "admin.withdrawal.approve",
      "admin.vendor.manage",
      "admin.map_campaign.manage",
    ]) {
      expect(sql).toContain(key);
    }
    expect(sql).toContain("Legacy Admin");
    expect(sql).toContain("Legacy Wallet Approver");
    expect(sql).toMatch(/Legacy Admin[\s\S]+admin\.kyc\.review[\s\S]+admin\.vendor\.manage/i);
    expect(sql).toMatch(/Legacy Wallet Approver[\s\S]+admin\.withdrawal\.approve/i);
    expect(sql).toMatch(/legacy_role\.name\s+IN\s+\('admin',\s*'approver'\)/i);
    expect(sql).toContain("admin.map_campaign.manage");
    expect(sql).toMatch(/DELETE FROM public\.staff_role_permissions[\s\S]+admin\.map_campaign\.manage/i);
  });

  it("defines a self-bound, fail-closed permission resolver", () => {
    const sql = migrationSql();
    const normalized = normalizedSql(sql);
    const resolverStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.has_staff_permission");
    const resolverEnd = sql.indexOf("CREATE OR REPLACE FUNCTION public.create_staff_role");
    const resolverSql = sql.slice(resolverStart, resolverEnd);

    expect(normalized).toContain("CREATE OR REPLACE FUNCTION public.has_staff_permission( p_user_id UUID, p_permission_key TEXT )");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public, pg_temp");
    expect(sql).toMatch(/auth\.role\(\)[^\n]+['"]service_role/i);
    expect(sql).toMatch(/p_user_id\s+IS DISTINCT FROM\s+auth\.uid\(\)/i);
    expect(sql).toMatch(/p_permission_key[\s\S]+?staff_permissions/i);
    expect(sql).toMatch(/staff_roles[\s\S]+?is_active\s*=\s*TRUE/i);
    expect(sql).toMatch(/staff_role_assignments[\s\S]+?revoked_at\s+IS NULL/i);
    expect(sql).toMatch(/EXCEPTION\s+WHEN OTHERS THEN/i);
    expect(sql).toContain("RETURN FALSE;");
    expect(resolverSql).toMatch(/legacy_assignment\.vendor_id\s+IS NULL/i);
    expect(resolverSql).toMatch(/legacy_assignment\.outlet_id\s+IS NULL/i);
    expect(resolverSql).toMatch(/legacy_role\.name\s+IN\s+\('admin',\s*'approver',\s*'super_admin'\)/i);
    expect(resolverSql).toMatch(/legacy_role\.name\s*=\s*'admin'[\s\S]+?admin\.kyc\.review[\s\S]+?admin\.vendor\.manage/i);
    expect(resolverSql).toMatch(/legacy_role\.name\s*=\s*'approver'[\s\S]+?admin\.withdrawal\.approve/i);
  });

  it("guards every governance RPC with Super Admin authorization and strict validation", () => {
    const sql = migrationSql();
    const normalized = normalizedSql(sql);

    for (const signature of [
      "public.create_staff_role( p_name TEXT, p_description TEXT, p_permission_keys TEXT[], p_reason TEXT )",
      "public.update_staff_role( p_role_id UUID, p_name TEXT, p_description TEXT, p_permission_keys TEXT[], p_active BOOLEAN, p_reason TEXT )",
      "public.assign_staff_role( p_role_id UUID, p_user_id UUID, p_reason TEXT )",
      "public.revoke_staff_role_assignment( p_assignment_id UUID, p_reason TEXT )",
    ]) {
      expect(normalized).toContain(`CREATE OR REPLACE FUNCTION ${signature}`);
    }

    const governanceStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.create_staff_role");
    const governanceSql = sql.slice(governanceStart);
    const governanceFunctionNames = [
      "create_staff_role",
      "update_staff_role",
      "assign_staff_role",
      "revoke_staff_role_assignment",
    ];
    for (const functionName of governanceFunctionNames) {
      const functionStart = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`);
      const functionEnd = sql.indexOf("CREATE OR REPLACE FUNCTION public.", functionStart + 1);
      const functionSql = sql.slice(functionStart, functionEnd === -1 ? undefined : functionEnd);
      expect(functionSql).toMatch(/v_actor\s*:=\s*public\.require_active_global_staff_super_admin\(\)/i);
    }

    const helperStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.require_active_global_staff_super_admin");
    const helperSql = sql.slice(helperStart, governanceStart);
    expect(helperSql).toMatch(/actor\.status\s*=\s*'active'/i);
    expect(helperSql).toMatch(/assignment\.vendor_id\s+IS NULL[\s\S]+?assignment\.outlet_id\s+IS NULL/i);
    expect(helperSql).toMatch(/role\.name\s*=\s*'super_admin'/i);
    expect(governanceSql).toContain("validate_staff_permission_keys");
    expect(governanceSql).toContain("system_role_protected");
    expect(governanceSql).toContain("legacy_role.name IN ('admin', 'approver', 'super_admin')");
    expect(governanceSql).toContain("validate_staff_reason");
  });

  it("records sanitized, transactional governance audit actions", () => {
    const sql = migrationSql();

    for (const action of [
      "staff.role.created",
      "staff.role.updated",
      "staff.role.assigned",
      "staff.role.revoked",
    ]) {
      expect(sql).toContain(action);
    }
    expect(sql).toMatch(/INSERT INTO public\.audit_logs\s*\(\s*actor_id,\s*action,\s*entity_type,\s*entity_id,\s*before_data,\s*after_data,\s*note\s*\)/i);
    expect(sql).toMatch(/BTRIM\(p_reason\)/i);
    expect(sql).toMatch(/jsonb_build_object\([\s\S]+?permissionKeys/i);
    expect(sql).not.toMatch(/jsonb_build_object\([^)]{0,300}p_description/i);
  });

  it("prevents browser table writes and anonymous RPC execution", () => {
    const sql = migrationSql();

    for (const table of [
      "staff_permissions",
      "staff_roles",
      "staff_role_permissions",
      "staff_role_assignments",
    ]) {
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`,
        "i",
      ));
    }

    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.has_staff_permission\(UUID, TEXT\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.create_staff_role\(TEXT, TEXT, TEXT\[\], TEXT\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.update_staff_role\(UUID, TEXT, TEXT, TEXT\[\], BOOLEAN, TEXT\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.assign_staff_role\(UUID, UUID, TEXT\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.revoke_staff_role_assignment\(UUID, TEXT\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.require_active_global_staff_super_admin\(\) FROM PUBLIC, anon, authenticated, service_role/i);
    expect(sql).toMatch(/CREATE POLICY staff_roles_super_admin_read/i);
    expect(sql).toMatch(/CREATE POLICY staff_role_assignments_super_admin_read/i);
  });

  it("revokes direct DML from service_role and keeps only governed table reads", () => {
    const sql = migrationSql();

    for (const table of [
      "staff_permissions",
      "staff_roles",
      "staff_role_permissions",
      "staff_role_assignments",
    ]) {
      expect(sql).toMatch(new RegExp(
        `REVOKE (?:ALL|INSERT, UPDATE, DELETE(?:, TRUNCATE)?) ON TABLE public\\.${table} FROM[^;]*service_role`,
        "i",
      ));
    }
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.staff_permissions[\s\S]+?TO authenticated, service_role/i);
  });

  it("requires unscoped coarse roles for assignments and compatibility backfill", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/legacy_assignment\.vendor_id\s+IS NULL[\s\S]+?legacy_assignment\.outlet_id\s+IS NULL/i);
    expect(sql).toMatch(/staff_role_assignments[\s\S]+?legacy_assignment\.vendor_id\s+IS NULL[\s\S]+?legacy_assignment\.outlet_id\s+IS NULL/i);
  });

  it("casts the migration-authored assignment actor to the UUID column type", () => {
    const sql = migrationSql();

    expect(sql).toMatch(
      /INSERT INTO public\.staff_role_assignments\s*\(role_id,\s*user_id,\s*assigned_by\)[\s\S]+?SELECT DISTINCT\s+staff_role\.id,\s*legacy_assignment\.user_id,\s*NULL::UUID/i,
    );
  });
});
