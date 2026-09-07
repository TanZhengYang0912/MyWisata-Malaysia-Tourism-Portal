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
    expect(sql).toMatch(/DROP POLICY IF EXISTS\s+["']?vendors_public_read["']?\s+ON public\.vendors/i);
    expect(sql).toMatch(/REVOKE\s+(?:INSERT,\s*UPDATE,\s*DELETE|ALL)\s+ON TABLE public\.vendors FROM authenticated/i);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.vendors TO anon, authenticated/i);
    expect(sql).toMatch(/CREATE POLICY\s+vendors_read_only_access\s+ON public\.vendors\s+FOR SELECT/i);
    expect(functionSql(sql, "staff_review_vendor")).not.toContain("is_admin");
    const readPolicy = sql.slice(
      sql.indexOf("CREATE POLICY vendors_read_only_access"),
      sql.indexOf("CREATE OR REPLACE FUNCTION public.", sql.indexOf("CREATE POLICY vendors_read_only_access")),
    );
    expect(readPolicy).not.toMatch(/\bis_admin\s*\(/i);
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
      expect(body).toMatch(/INSERT INTO public\.audit_logs/i);
      expect(body).toMatch(/LEFT\s*\(\s*BTRIM\(COALESCE\(p_reason, ''\)\),\s*500\s*\)/i);
    }

    expect(functionSql(sql, "staff_review_vendor")).toMatch(/admin_approve_claimed_vendor\s*\(\s*p_vendor_id\s*\)/i);
    expect(functionSql(sql, "staff_review_vendor")).toMatch(/UPDATE public\.vendors[\s\S]+status\s*=\s*'rejected'/i);
    expect(functionSql(sql, "staff_set_vendor_suspension")).toMatch(/UPDATE public\.vendors[\s\S]+status\s*=\s*v_new_status/i);
  });

  it("enforces dedicated permissions inside the direct KYC and withdrawal RPCs", () => {
    const sql = migrationSql();
    const kyc = functionSql(sql, "admin_review_kyc");
    const withdrawal = functionSql(sql, "approve_wallet_withdrawal");

    expect(kyc).toMatch(/has_staff_permission\s*\(\s*auth\.uid\(\),\s*'admin\.kyc\.review'\s*\)/i);
    expect(kyc).not.toMatch(/can_review_kyc\s*\(/i);
    expect(kyc).toMatch(/role_row\.name IN \('admin', 'approver', 'super_admin'\)/i);
    expect(kyc).toContain("kyc_permission_required");
    for (const invariant of [
      "self_dealing", "kyc_not_active_or_not_found", "kyc_not_assigned",
      "kyc_review_events", "recompute_compatibility_tier", "audit_logs", "notifications",
    ]) expect(kyc).toContain(invariant);

    expect(withdrawal).toMatch(/has_staff_permission\s*\(\s*v_actor,\s*'admin\.withdrawal\.approve'\s*\)/i);
    expect(withdrawal).not.toMatch(/is_approver\s*\(/i);
    expect(withdrawal).toContain("withdrawal_permission_required");
    for (const invariant of [
      "self_dealing", "pending_second_approval", "high_risk_override_required",
      "withdrawal_approvals", "audit_logs", "notifications",
    ]) expect(withdrawal).toContain(invariant);
  });

  it("protects direct recommendation conversion with Vendor permission and preserved invariants", () => {
    const sql = migrationSql();
    const conversion = functionSql(sql, "convert_claimed_vendor_recommendation");

    expect(conversion).toMatch(/has_staff_permission\s*\(\s*auth\.uid\(\),\s*'admin\.vendor\.manage'\s*\)/i);
    expect(conversion).not.toMatch(/can_review_recommendation\s*\(/i);
    expect(conversion).toContain("vendor_permission_required");
    for (const invariant of [
      "vendor_not_approved", "recommendation_not_found", "self_dealing",
      "claim_link_not_found", "recommendation_not_ready_for_conversion",
      "attribution_window_days", "credit_pending_recommendation",
    ]) expect(conversion).toContain(invariant);
  });

  it("allows authenticated execution only through the secured RPCs", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.staff_review_vendor\(UUID, TEXT, TEXT\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.staff_review_vendor\(UUID, TEXT, TEXT\) TO authenticated, service_role/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.staff_set_vendor_suspension\(UUID, TEXT, TEXT\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.staff_set_vendor_suspension\(UUID, TEXT, TEXT\) TO authenticated, service_role/i);
  });
});
