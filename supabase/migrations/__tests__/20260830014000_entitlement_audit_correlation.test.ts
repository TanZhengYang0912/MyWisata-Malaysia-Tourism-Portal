import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../20260830014000_entitlement_audit_correlation.sql", import.meta.url);
const policyGovernanceUrl = new URL("../20260830011000_entitlement_policy_governance.sql", import.meta.url);
const capabilityGovernanceUrl = new URL("../20260830011500_entitlement_capability_governance.sql", import.meta.url);

function migrationSql() {
  expect(existsSync(migrationUrl), "audit correlation migration must exist").toBe(true);
  return readFileSync(migrationUrl, "utf8");
}

describe("entitlement audit correlation migration", () => {
  it("adds one forward-only BEFORE INSERT correlation trigger without replacing append-only protection", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/CREATE TRIGGER entitlement_audit_correlation[\s\S]+BEFORE INSERT ON public\.audit_logs/i);
    expect(sql).toContain("audit_logs_append_only");
    expect(sql).not.toMatch(/DROP TRIGGER IF EXISTS audit_logs_append_only/i);
    expect(sql).toMatch(/REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public\.audit_logs[\s\S]+anon, authenticated, service_role/i);
  });

  it("generates and enforces exactly one server-owned non-secret trace reference", () => {
    const sql = migrationSql();
    expect(sql).toContain("NEW.action LIKE 'entitlement.%'");
    expect(sql).toMatch(/v_trace_reference\s+TEXT\s*:=\s*gen_random_uuid\(\)::TEXT/i);
    expect(sql).toMatch(/NEW\.before_data\s*:=\s*NEW\.before_data\s*-\s*'traceReference'/i);
    expect(sql).toMatch(/NEW\.after_data[\s\S]+-\s*'traceReference'[\s\S]+jsonb_build_object\('traceReference', v_trace_reference\)/i);
    expect(sql).not.toMatch(/p_(?:trace|actor)(?:_reference|_id)?/i);
  });

  it("accepts shadow telemetry only from the service role and forces a system actor", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/NEW\.action = 'entitlement\.shadow_evaluation'[\s\S]+auth\.role\(\)[\s\S]+service_role/i);
    expect(sql).toContain("RAISE EXCEPTION 'shadow_evaluation_service_role_required'");
    expect(sql).toMatch(/NEW\.actor_id\s*:=\s*NULL/i);
  });

  it("derives policy-version correlation from the trusted audit entity instead of input", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/NEW\.action LIKE 'entitlement\.policy%'/i);
    expect(sql).toMatch(/jsonb_build_object\('policyVersionId', NEW\.entity_id\)/i);
    expect(sql).toMatch(/NEW\.before_data\s*:=\s*NEW\.before_data\s*-\s*'policyVersionId'/i);
  });

  it("keeps the trigger private and does not change Catalogue Review storage or grants", () => {
    const sql = migrationSql();
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.correlate_entitlement_audit_insert\(\)[\s\S]+PUBLIC, anon, authenticated, service_role/i);
    expect(sql).not.toMatch(/content_reviews|catalogue/i);
    expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|TRUNCATE|ALL) ON (?:TABLE )?public\.audit_logs/i);
  });

  it("covers every existing governed Access Control mutation without accepting browser trace or actor claims", () => {
    const governance = `${readFileSync(policyGovernanceUrl, "utf8")}\n${readFileSync(capabilityGovernanceUrl, "utf8")}`;
    for (const action of [
      "entitlement.capability.updated",
      "entitlement.policy_version.created",
      "entitlement.policy_version.approved",
      "entitlement.policy_version.activated",
      "entitlement.policy.rollback_requested",
      "entitlement.assignment.set",
      "entitlement.assignment.revoked",
    ]) {
      expect(governance).toContain(action);
    }
    expect(governance).not.toMatch(/p_(?:trace|actor)(?:_reference|_id)?/i);
    expect(migrationSql()).toContain("NEW.action LIKE 'entitlement.%'");
  });
});
