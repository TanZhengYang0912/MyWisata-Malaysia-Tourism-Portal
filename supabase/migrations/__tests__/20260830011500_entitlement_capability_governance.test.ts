import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../20260830011500_entitlement_capability_governance.sql", import.meta.url);
const evaluatorUrl = new URL("../20260830011000_entitlement_policy_governance.sql", import.meta.url);

function migrationSql() {
  expect(existsSync(migrationUrl), "capability governance migration must exist").toBe(true);
  return readFileSync(migrationUrl, "utf8");
}

function functionSql(name: string) {
  const match = migrationSql().match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([^]*?\\n\\$\\$;`,
    "i",
  ));
  expect(match, `${name} must exist`).not.toBeNull();
  return match![0];
}

describe("entitlement capability governance migration", () => {
  it("creates one governed capability metadata update RPC", () => {
    const sql = functionSql("update_entitlement_capability");
    expect(sql).toMatch(/RETURNS UUID[\s\S]+SECURITY DEFINER/i);
    expect(sql).toContain("SET search_path = public, pg_temp");
    for (const parameter of [
      "p_capability_key TEXT",
      "p_category TEXT",
      "p_risk_level TEXT",
      "p_customer_visible BOOLEAN",
      "p_manually_assignable BOOLEAN",
      "p_enabled BOOLEAN",
      "p_reason TEXT",
    ]) {
      expect(sql).toContain(parameter);
    }
  });

  it("derives the actor and permits only a Super Admin", () => {
    const sql = functionSql("update_entitlement_capability");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("public.is_super_admin");
    expect(sql).toContain("super_admin_required");
    expect(sql).not.toMatch(/p_actor(?:_id)?/i);
  });

  it("validates all metadata, bounds the reason, and locks the target row", () => {
    const sql = functionSql("update_entitlement_capability");
    expect(sql).toContain("public.validate_entitlement_reason(p_reason)");
    expect(sql).toMatch(/p_category IS NULL[\s\S]+p_risk_level IS NULL/i);
    expect(sql).toMatch(/p_category NOT IN \('platform','commerce','ai','recommendation','affiliate','wallet'\)/i);
    expect(sql).toMatch(/p_risk_level NOT IN \('low','medium','high','critical'\)/i);
    expect(sql).toMatch(/p_customer_visible IS NULL[\s\S]+p_manually_assignable IS NULL[\s\S]+p_enabled IS NULL/i);
    expect(sql).toMatch(/FROM public\.capabilities[\s\S]+WHERE key = p_capability_key[\s\S]+FOR UPDATE/i);
    expect(sql).toContain("capability_not_found");
  });

  it("keeps keys immutable and rejects a no-op explicitly", () => {
    const sql = functionSql("update_entitlement_capability");
    expect(sql).toContain("capability_no_changes");
    expect(sql).toMatch(/UPDATE public\.capabilities[\s\S]+SET category = p_category/i);
    const updateSet = sql.match(/UPDATE public\.capabilities[\s\S]+?SET ([\s\S]+?)WHERE key = p_capability_key;/i)?.[1] ?? "";
    expect(updateSet).not.toMatch(/\bkey\s*=/i);
    expect(readFileSync(new URL("../20260830010000_dynamic_entitlement_catalog.sql", import.meta.url), "utf8"))
      .toContain("capabilities_key_immutable");
  });

  it("increments generation and writes one explicit before/after audit event", () => {
    const sql = functionSql("update_entitlement_capability");
    expect(sql).toContain("public.increment_entitlement_generation()");
    expect(sql).toContain("public.current_entitlement_generation()");
    expect((sql.match(/INSERT INTO public\.audit_logs/gi) ?? [])).toHaveLength(1);
    expect(sql).toContain("entitlement.capability.updated");
    for (const key of [
      "capabilityKey",
      "category",
      "riskLevel",
      "customerVisible",
      "manuallyAssignable",
      "enabled",
      "generation",
    ]) {
      expect(sql).toContain(`'${key}'`);
    }
  });

  it("revokes public, anonymous, and service execution while allowing guarded authenticated calls", () => {
    const sql = migrationSql();
    const signature = "update_entitlement_capability(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT)";
    expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${signature}`);
    expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature.replace(/[()]/g, "\\$&")}[\\s\\S]+FROM PUBLIC, anon, authenticated, service_role`, "i"));
    expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature.replace(/[()]/g, "\\$&")}[\\s\\S]+TO authenticated`, "i"));
    expect(sql).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature.replace(/[()]/g, "\\$&")}[\\s\\S]+TO (?:anon|service_role)`, "i"));
  });

  it("keeps disabled capabilities default-denied in the existing evaluator", () => {
    const evaluator = readFileSync(evaluatorUrl, "utf8");
    expect(evaluator).toMatch(/SELECT capability\.enabled INTO v_capability_enabled/i);
    expect(evaluator).toContain("IF NOT v_capability_enabled THEN");
    expect(evaluator).toContain("'source', 'default_deny'");
  });
});
