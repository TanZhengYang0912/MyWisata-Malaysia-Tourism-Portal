import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../20260830011000_entitlement_policy_governance.sql",
  import.meta.url,
);

function migrationSql(): string {
  expect(existsSync(migrationUrl), "entitlement governance migration must exist").toBe(true);
  return readFileSync(migrationUrl, "utf8");
}

function functionSql(name: string): string {
  const sql = migrationSql();
  const match = sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([^]*?\\n\\$\\$;`,
    "i",
  ));
  expect(match, `${name} must exist`).not.toBeNull();
  return match![0];
}

describe("entitlement policy governance migration", () => {
  it("builds facts only from the strict registered server-side vocabulary", () => {
    const sql = functionSql("entitlement_fact_value");

    for (const fact of [
      "email_verified",
      "phone_verified",
      "profile_complete",
      "kyc_status",
      "account_status",
      "role",
      "plan",
      "partner",
    ]) {
      expect(sql).toContain(`'${fact}'`);
    }
    expect(sql).toContain("FROM public.users");
    expect(sql).toContain("FROM public.user_roles");
    expect(sql).toContain("RAISE EXCEPTION 'policy_invalid'");
    expect(sql).not.toMatch(/p_(?:facts|actor_id)\b/i);
  });

  it("supports only eq, not_eq, and contains with AND groups and OR alternatives", () => {
    const matcher = functionSql("entitlement_requirement_matches");
    const resolver = functionSql("resolve_user_capability");

    expect(matcher).toContain("'eq'");
    expect(matcher).toContain("'not_eq'");
    expect(matcher).toContain("'contains'");
    expect(matcher).toContain("RAISE EXCEPTION 'policy_invalid'");
    expect(resolver).toContain(
      "GROUP BY requirement.policy_version_id, requirement.alternative_group",
    );
    expect(resolver).toMatch(/HAVING bool_and\(/i);
    expect(resolver).toMatch(/EXISTS \([\s\S]+matching_groups/i);
  });

  it("authorizes self-resolution or service role and fails policy errors closed", () => {
    const sql = functionSql("resolve_user_capability");

    expect(sql).toMatch(/auth\.role\(\)[\s\S]+service_role/i);
    expect(sql).toMatch(/auth\.uid\(\)[\s\S]+p_user_id/i);
    expect(sql).toContain("resolver_subject_forbidden");
    expect(sql).toContain("POLICY_UNAVAILABLE");
    const migration = migrationSql();
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.resolve_user_capability\(UUID, TEXT\)[\s\S]+FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.resolve_user_capability\(UUID, TEXT\)[\s\S]+authenticated, service_role/i);
  });

  it("applies account and hard guards before explicit deny, allow, then default deny", () => {
    const sql = functionSql("resolve_user_capability");
    const hardGuard = sql.indexOf("capability_hard_guard");
    const explicitDeny = sql.indexOf("-- Explicit deny always wins");
    const explicitAllow = sql.indexOf("-- An allow can select a capability");
    const defaultDeny = sql.lastIndexOf("default_deny");

    expect(hardGuard).toBeGreaterThan(-1);
    expect(explicitDeny).toBeGreaterThan(hardGuard);
    expect(explicitAllow).toBeGreaterThan(explicitDeny);
    expect(defaultDeny).toBeGreaterThan(explicitAllow);
    expect(functionSql("capability_hard_guard")).toContain("ACCOUNT_RESTRICTED");
  });

  it("ignores expired and revoked assignments and keeps manual allow behind hard guards", () => {
    const resolver = functionSql("resolve_user_capability");
    const setter = functionSql("set_entitlement_assignment");

    expect(resolver).toMatch(/assignment\.revoked_at IS NULL/i);
    expect(resolver).toMatch(/assignment\.starts_at <= now\(\)/i);
    expect(resolver).toMatch(/assignment\.expires_at IS NULL OR assignment\.expires_at > now\(\)/i);
    expect(resolver.indexOf("capability_hard_guard")).toBeLessThan(
      resolver.indexOf("entitlement_assignments"),
    );
    expect(setter).toContain("manually_assignable");
    expect(setter).toContain("capability_not_manually_assignable");
  });

  it("derives every governed mutation actor and enforces Super Admin authority", () => {
    for (const name of [
      "create_entitlement_policy_version",
      "approve_entitlement_policy_version",
      "activate_entitlement_policy_version",
      "rollback_entitlement_policy",
      "set_entitlement_assignment",
      "revoke_entitlement_assignment",
    ]) {
      const sql = functionSql(name);
      expect(sql).toContain("auth.uid()");
      expect(sql).toContain("public.is_super_admin");
      expect(sql).toContain("super_admin_required");
      expect(sql).not.toMatch(/p_actor_id/i);
      expect((sql.match(/INSERT INTO public\.audit_logs/gi) ?? [])).toHaveLength(1);
    }
  });

  it("enforces independent approval, immutable activation, and generation changes", () => {
    const approval = functionSql("approve_entitlement_policy_version");
    const activation = functionSql("activate_entitlement_policy_version");
    const rollback = functionSql("rollback_entitlement_policy");

    expect(approval).toContain("self_approval_forbidden");
    expect(approval).toMatch(/risk_level[\s\S]+(?:high|critical)/i);
    expect(activation).toContain("policy_version_not_approved");
    expect(activation).toMatch(/status = 'retired'/i);
    expect(activation).toMatch(/status = 'active'/i);
    expect(rollback).toMatch(/INSERT INTO public\.entitlement_policy_versions/i);
    expect(rollback).toContain("self_approval_forbidden");
    for (const name of [
      "activate_entitlement_policy_version",
      "rollback_entitlement_policy",
      "set_entitlement_assignment",
      "revoke_entitlement_assignment",
    ]) {
      expect(functionSql(name)).toContain("increment_entitlement_generation");
    }
  });

  it("rejects null requirement payloads and expired rollback targets", () => {
    const creation = functionSql("create_entitlement_policy_version");
    const rollback = functionSql("rollback_entitlement_policy");

    expect(creation).toMatch(/p_requirements IS NULL[\s\S]+jsonb_typeof\(p_requirements\) <> 'array'/i);
    expect(rollback).toContain("rollback_target_expired");
  });

  it("exposes exact governed RPC signatures with hardened execution grants", () => {
    const sql = migrationSql();

    for (const signature of [
      "create_entitlement_policy_version(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT)",
      "approve_entitlement_policy_version(UUID, TEXT)",
      "activate_entitlement_policy_version(UUID, TEXT)",
      "rollback_entitlement_policy(UUID, INTEGER, TEXT)",
      "set_entitlement_assignment(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)",
      "revoke_entitlement_assignment(UUID, TEXT)",
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature}`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature}`);
    }
  });
});
