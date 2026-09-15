import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260915222000_dynamic_staff_modules.sql"),
  "utf8",
);

function functionSql(name: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + 1);
  return sql.slice(start, next === -1 ? sql.length : next);
}

describe("dynamic staff module RBAC migration", () => {
  it("creates normalized module, mapping, role, group and compatibility storage", () => {
    for (const table of [
      "staff_modules",
      "staff_module_permissions",
      "staff_role_modules",
      "staff_module_groups",
      "staff_module_group_members",
      "staff_module_legacy_roles",
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`, "i"));
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
    }
    expect(sql).toMatch(/staff_modules_key_format[\s\S]+\^\[a-z\]\[a-z0-9_\]\*\$/i);
    expect(sql).toMatch(/staff_modules_admin_href[\s\S]+\^\/admin/i);
    expect(sql).toMatch(/staff_role_modules[\s\S]+PRIMARY KEY\s*\(role_id, module_id\)/i);
  });

  it("seeds every current Admin menu from database records", () => {
    for (const key of [
      "overview", "vendor_approvals", "catalogue_review", "sponsored_placements", "kyc_review",
      "recommendations", "withdrawals", "refunds", "wallet_settings", "wallet_approvers",
      "payout_reports", "reconciliation", "support_tickets", "chat_reports", "affiliate", "chatbot",
      "user_management", "access_control", "ai_assistant", "staff_conduct", "moderation_words",
    ]) {
      expect(sql).toContain(`'${key}'`);
    }
  });

  it("registers Catalogue Review and locks it to Vendor Approvals", () => {
    expect(sql).toContain("'admin.catalogue.review'");
    expect(sql).toMatch(/'catalogue_governance'[\s\S]+'vendor_approvals'[\s\S]+'catalogue_review'/i);
    const validator = functionSql("validate_staff_module_keys");
    expect(validator).toMatch(/staff_module_group_members/i);
    expect(validator).toMatch(/array_agg[\s\S]+ORDER BY/i);
  });

  it("creates audited Super-Admin-only module and role write RPCs", () => {
    for (const name of [
      "create_staff_module",
      "update_staff_module",
      "create_staff_role_with_modules",
      "update_staff_role_with_modules",
    ]) {
      const body = functionSql(name);
      expect(body).toMatch(/SECURITY DEFINER/i);
      expect(body).toMatch(/require_active_global_staff_super_admin/i);
      expect(body).toMatch(/audit_logs/i);
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}`, "i"));
    }
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.create_staff_role\(TEXT, TEXT, TEXT\[\], TEXT\) FROM authenticated/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.update_staff_role\(UUID, TEXT, TEXT, TEXT\[\], BOOLEAN, TEXT\) FROM authenticated/i);
  });

  it("allows an ungrouped custom Module to join or leave a non-system group", () => {
    const update = functionSql("update_staff_module");
    expect(update).toMatch(/IF COALESCE\(v_before_group\.is_system, FALSE\) = FALSE THEN/i);
  });

  it("keeps authorization server-side and returns effective dynamic modules", () => {
    const permission = functionSql("has_staff_permission");
    expect(permission).toMatch(/staff_module_permissions/i);
    expect(permission).toMatch(/staff_module_legacy_roles/i);
    expect(permission).toMatch(/grants_permissions\s*=\s*TRUE/i);

    const access = functionSql("get_my_staff_access");
    expect(access).toMatch(/auth\.uid\(\)/i);
    expect(access).toMatch(/staff_role_modules/i);
    expect(access).toMatch(/staff_module_legacy_roles/i);
    expect(access).toMatch(/'modules'/i);
    expect(access).toMatch(/'permissionKeys'/i);
  });

  it("allows only governed reads and RPC writes", () => {
    expect(sql).toMatch(/CREATE POLICY staff_modules_super_admin_read[\s\S]+is_super_admin\(auth\.uid\(\)\)/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.staff_modules[\s\S]+FROM PUBLIC, anon, authenticated, service_role/i);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.staff_modules[\s\S]+TO authenticated, service_role/i);
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]+staff_modules[\s\S]+FOR (?:INSERT|UPDATE|DELETE|ALL)/i);
  });
});
