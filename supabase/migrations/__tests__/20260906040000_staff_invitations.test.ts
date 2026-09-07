import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260906040000_staff_invitations.sql",
);

function migrationSql() {
  expect(existsSync(migrationPath), "staff invitation migration must exist").toBe(true);
  return readFileSync(migrationPath, "utf8");
}

function functionSql(sql: string, name: string) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + 1);
  return sql.slice(start, next === -1 ? undefined : next);
}

describe("staff invitation least-privilege migration", () => {
  it("adds a shell-only staff role and a token-hash-only invitation table", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/INSERT INTO public\.roles\s*\(name,\s*description\)[\s\S]*?'staff'/i);
    expect(sql).toMatch(/CREATE TABLE public\.staff_invitations\s*\(/i);
    expect(sql).toMatch(/token_hash\s+TEXT\s+NOT NULL\s+UNIQUE/i);
    expect(sql).toMatch(/status\s+TEXT\s+NOT NULL[\s\S]*?pending[\s\S]*?accepted[\s\S]*?revoked/i);
    expect(sql).toMatch(/delivery_status\s+TEXT\s+NOT NULL[\s\S]*?sending[\s\S]*?sent[\s\S]*?failed/i);
    expect(sql).toMatch(/CREATE UNIQUE INDEX staff_invitations_one_pending_email[\s\S]*?lower\(invited_email\)[\s\S]*?WHERE status = 'pending'/i);
    expect(sql).not.toMatch(/\b(raw_token|invite_url)\b/i);
  });

  it("keeps invitation tables private and exposes only governed RPCs", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/ALTER TABLE public\.staff_invitations ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.staff_invitations FROM PUBLIC, anon, authenticated/i);
    expect(sql).not.toMatch(/GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)[\s\S]{0,100}staff_invitations[\s\S]{0,100}TO\s+anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.accept_staff_invitation\(TEXT\) TO authenticated/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.accept_staff_invitation\(TEXT\) FROM PUBLIC, anon/i);
  });

  it("prepares invitations only through active global Super Admin governance", () => {
    const sql = migrationSql();
    for (const name of [
      "prepare_staff_invitation",
      "prepare_staff_invitation_resend",
      "finalize_staff_invitation_delivery",
      "revoke_staff_invitation",
    ]) {
      expect(functionSql(sql, name)).toContain("require_active_global_staff_super_admin");
    }
    const prepare = functionSql(sql, "prepare_staff_invitation");
    expect(prepare).toContain("validate_staff_reason");
    expect(prepare).toMatch(/EXISTS\s*\(\s*SELECT 1\s+FROM public\.user_roles[\s\S]*?user_id\s*=\s*v_existing_user\.id/i);
    expect(prepare).not.toMatch(/role_row\.name\s+IN/i);
    expect(prepare).toMatch(/FOR UPDATE/i);
    expect(prepare).toContain("staff.invitation.created");
  });

  it("rotates resend tokens under a row lock and leaves terminal rows closed", () => {
    const sql = migrationSql();
    const resend = functionSql(sql, "prepare_staff_invitation_resend");
    const revoke = functionSql(sql, "revoke_staff_invitation");

    expect(resend).toMatch(/FOR UPDATE/i);
    expect(resend).toMatch(/v_invitation\.status\s*<>\s*'pending'/i);
    expect(resend).toMatch(/token_hash\s*=\s*p_token_hash/i);
    expect(resend).toMatch(/expires_at\s*=\s*p_expires_at/i);
    expect(resend).toContain("staff.invitation.resent");
    expect(revoke).toMatch(/status\s*=\s*'revoked'/i);
    expect(revoke).toContain("revoked_reason");
    expect(revoke).toContain("staff.invitation.revoked");
  });

  it("provisions matching invite signups without a Customer role", () => {
    const sql = migrationSql();
    const trigger = functionSql(sql, "handle_new_auth_user");

    expect(trigger).toMatch(/FROM public\.staff_invitations[\s\S]*?status\s*=\s*'pending'[\s\S]*?expires_at\s*>\s*now\(\)[\s\S]*?FOR UPDATE/i);
    expect(trigger).toMatch(/UPDATE public\.staff_invitations[\s\S]*?claimed_by\s*=\s*NEW\.id/i);
    expect(trigger).toMatch(/IF v_staff_invitation_id IS NULL THEN[\s\S]*?r\.name\s*=\s*'customer'/i);
  });

  it("accepts only a verified, matching, roleless claimed identity atomically", () => {
    const sql = migrationSql();
    const accept = functionSql(sql, "accept_staff_invitation");

    expect(accept).toMatch(/FROM public\.staff_invitations[\s\S]*?token_hash\s*=\s*p_token_hash[\s\S]*?FOR UPDATE/i);
    expect(accept).toMatch(/email_confirmed_at\s+IS\s+NULL/i);
    expect(accept).toMatch(/lower\(btrim\(v_auth_email\)\)[\s\S]*?lower\(btrim\(v_invitation\.invited_email\)\)/i);
    expect(accept).toMatch(/v_invitation\.claimed_by\s+IS DISTINCT FROM\s+v_user_id/i);
    expect(accept).toMatch(/FROM public\.users[\s\S]*?id\s*=\s*v_user_id[\s\S]*?FOR UPDATE/i);
    expect(accept).toMatch(/EXISTS\s*\(SELECT 1 FROM public\.user_roles WHERE user_id = v_user_id\)/i);
    expect(accept).toMatch(/permission_keys_snapshot\s+IS DISTINCT FROM/i);
    expect(accept).toMatch(/role_row\.name\s*=\s*'staff'/i);
    expect(accept).toMatch(/INSERT INTO public\.user_roles/i);
    expect(accept).toMatch(/INSERT INTO public\.staff_role_assignments/i);
    expect(accept).toMatch(/status\s*=\s*'accepted'[\s\S]*?accepted_by\s*=\s*v_user_id/i);
    expect(accept).toContain("staff.invitation.accepted");
  });

  it("keeps staff permissions self-bound without broadening is_admin", () => {
    const sql = migrationSql();
    const permissions = functionSql(sql, "has_staff_permission");
    const admin = functionSql(sql, "is_admin");

    expect(permissions).toMatch(/legacy_role\.name IN \('admin', 'approver', 'super_admin', 'staff'\)/i);
    expect(permissions).toMatch(/p_user_id\s+IS DISTINCT FROM\s+auth\.uid\(\)/i);
    expect(admin).not.toMatch(/'staff'/i);
    expect(functionSql(sql, "is_approver")).not.toMatch(/has_staff_permission|'staff'/i);
    expect(functionSql(sql, "get_my_staff_access")).toMatch(/auth\.uid\(\)/i);
  });

  it("keeps Legacy roles as templates and upgrades only explicit work RPC guards", () => {
    const sql = migrationSql();
    expect(functionSql(sql, "prepare_staff_invitation")).toContain("system_role_template_only");
    expect(functionSql(sql, "assign_staff_role")).toContain("system_role_template_only");
    expect(sql).toContain("procedure.proname IN (");
    expect(sql).toContain("'hold_wallet_withdrawal'");
    expect(sql).toContain("'get_withdrawal_review_sources'");
    expect(sql).toContain("role_row.name IN (''admin'', ''approver'', ''staff'', ''super_admin'')");
  });

  it("enforces normalized identity, governance, expiry, and attempt constraints", () => {
    const sql = migrationSql();
    const finalize = functionSql(sql, "finalize_staff_invitation_delivery");

    expect(sql).toMatch(/invited_email\s*=\s*lower\(btrim\(invited_email\)\)/i);
    expect(sql).toMatch(/char_length\(invited_email\)\s+BETWEEN\s+3\s+AND\s+254/i);
    expect(sql).toMatch(/token_hash\s*~\s*'\^\[0-9a-f\]\{64\}\$'/i);
    expect(sql).toMatch(/char_length\(btrim\(reason\)\)\s+BETWEEN\s+10\s+AND\s+500/i);
    expect(sql).toMatch(/accepted_by\s*=\s*claimed_by/i);
    expect(functionSql(sql, "prepare_staff_invitation")).toMatch(/p_expires_at\s*>\s*now\(\)\s*\+\s*INTERVAL '7 days'/i);
    expect(finalize).toMatch(/token_hash\s+IS DISTINCT FROM\s+p_token_hash/i);
    expect(finalize).toMatch(/delivery_status\s*<>\s*'sending'/i);
  });

  it("lets joined Staff receive additional governed role assignments", () => {
    const sql = migrationSql();
    const assign = functionSql(sql, "assign_staff_role");

    expect(assign).toMatch(/legacy_role\.name IN \('admin', 'approver', 'super_admin', 'staff'\)/i);
    expect(assign).toContain("staff.role.assigned");
  });
});
