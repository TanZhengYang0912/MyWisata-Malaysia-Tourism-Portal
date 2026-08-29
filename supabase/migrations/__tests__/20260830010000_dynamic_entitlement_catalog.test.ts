import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../20260830010000_dynamic_entitlement_catalog.sql",
  import.meta.url,
);

function migrationSql(): string {
  expect(existsSync(migrationUrl), "entitlement catalog migration must exist").toBe(true);
  return readFileSync(migrationUrl, "utf8");
}

describe("dynamic entitlement catalog migration", () => {
  it("creates the normalized catalog and governance table family", () => {
    const sql = migrationSql();

    for (const table of [
      "capabilities",
      "entitlement_policies",
      "entitlement_policy_versions",
      "entitlement_policy_requirements",
      "entitlement_policy_approvals",
      "entitlement_assignments",
      "entitlement_generation",
    ]) {
      expect(sql).toContain(`CREATE TABLE public.${table}`);
    }

    expect(sql).toContain("UNIQUE (policy_id, version)");
    expect(sql).toContain("CHECK (subject_type IN ('user','role','plan','partner'))");
    expect(sql).toContain("CHECK (effect IN ('allow','deny'))");
    expect(sql).toContain(
      "CHECK (status IN ('draft','pending_approval','scheduled','active','retired'))",
    );
    expect(sql).toContain("REFERENCES public.users(id)");
  });

  it("enforces one active version and one unrevoked assignment", () => {
    const sql = migrationSql();

    expect(sql).toMatch(
      /CREATE UNIQUE INDEX entitlement_policy_versions_one_active_per_policy[\s\S]+?ON public\.entitlement_policy_versions \(policy_id\)[\s\S]+?WHERE status = 'active'/i,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX entitlement_assignments_one_live_effect[\s\S]+?\(subject_type, subject_id, capability_key, effect\)[\s\S]+?WHERE revoked_at IS NULL/i,
    );
    expect(sql).toContain("CREATE TRIGGER entitlement_policy_versions_immutable_after_activation");
    expect(sql).toContain("CREATE TRIGGER entitlement_policy_requirements_immutable_after_activation");
    expect(sql).toContain("CREATE TRIGGER capabilities_key_immutable");
  });

  it("seeds one active built-in allow policy for every customer capability", () => {
    const sql = migrationSql();

    expect(sql).toContain("'builtin.platform.browse'");
    expect(sql).toContain("'builtin.wallet.request_withdrawal'");
    expect(sql).not.toContain("'builtin.wallet.approve_withdrawal'");
    expect(sql).toMatch(
      /INSERT INTO public\.entitlement_policy_versions[\s\S]+?'active'[\s\S]+?'allow'/i,
    );
  });

  it("stores the approved AND/OR verification requirements as structured facts", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "('builtin.recommendation.submit', 1, 'email_verified', 'eq', 'true'::jsonb)",
    );
    expect(sql).toContain(
      "('builtin.recommendation.submit', 1, 'profile_complete', 'eq', 'true'::jsonb)",
    );
    expect(sql).toContain(
      "('builtin.recommendation.submit', 2, 'email_verified', 'eq', 'true'::jsonb)",
    );
    expect(sql).toContain(
      `(\'builtin.recommendation.submit\', 2, \'kyc_status\', \'eq\', '"approved"'::jsonb)`.replaceAll(
        "\\'",
        "'",
      ),
    );
    expect(sql).toContain(
      `(\'builtin.affiliate.limited\', 1, \'kyc_status\', \'not_eq\', '"approved"'::jsonb)`.replaceAll(
        "\\'",
        "'",
      ),
    );
    expect(sql).not.toMatch(/EXECUTE\s+.+expected_value/i);
    expect(sql).not.toMatch(/\b(sql|javascript|expression|script)_body\b/i);
  });

  it("does not expose trigger helpers for direct browser execution", () => {
    const sql = migrationSql();

    expect(sql.match(/SET search_path = public, pg_temp/g)).toHaveLength(3);
    for (const helper of [
      "protect_capability_key()",
      "protect_activated_entitlement_policy_version()",
      "protect_activated_entitlement_policy_requirement()",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${helper.replace(/[()]/g, "\\$&")}\\s+FROM PUBLIC, anon, authenticated, service_role`,
          "i",
        ),
      );
    }
  });

  it("keeps browser roles out of policy and assignment storage", () => {
    const sql = migrationSql();
    const protectedTables = [
      "capabilities",
      "entitlement_policies",
      "entitlement_policy_versions",
      "entitlement_policy_requirements",
      "entitlement_policy_approvals",
      "entitlement_assignments",
      "entitlement_generation",
    ];

    for (const table of protectedTables) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON TABLE public\\.${table}\\s+FROM PUBLIC, anon, authenticated, service_role`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(`GRANT SELECT ON TABLE public\\.${table}\\s+TO service_role`, "i"),
      );
    }

    expect(sql).not.toMatch(
      /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]+?entitlement_assignments[\s\S]+?TO (?:anon|authenticated)/i,
    );
    expect(sql).not.toMatch(
      /GRANT (?:INSERT|UPDATE|DELETE|ALL)[\s\S]+?(?:capabilities|entitlement_policies|entitlement_policy_versions|entitlement_policy_requirements|entitlement_policy_approvals|entitlement_assignments|entitlement_generation)[\s\S]+?TO (?:anon|authenticated|service_role)/i,
    );
  });
});
