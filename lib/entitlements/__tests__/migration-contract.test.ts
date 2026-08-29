import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CAPABILITY_KEYS } from "../types";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260830010000_dynamic_entitlement_catalog.sql",
);

function migrationSql(): string {
  expect(existsSync(migrationPath), "entitlement catalog migration must exist").toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("entitlement migration domain contract", () => {
  it("seeds every stable capability key exactly once in the catalog values", () => {
    const sql = migrationSql();
    const catalogSeed = sql.match(
      /INSERT INTO public\.capabilities[\s\S]+?ON CONFLICT \(key\) DO NOTHING;/i,
    )?.[0];

    expect(catalogSeed, "capability catalog seed must be present").toBeDefined();
    for (const capability of CAPABILITY_KEYS) {
      expect(catalogSeed?.match(new RegExp(`'${capability.replace(".", "\\.")}'`, "g"))).toHaveLength(1);
    }
  });

  it("allows only registered fact keys and non-executable operators", () => {
    const sql = migrationSql();

    expect(sql).toContain(
      "CHECK (fact_key IN ('email_verified','phone_verified','profile_complete','kyc_status','account_status','role','plan','partner'))",
    );
    expect(sql).toContain("CHECK (operator IN ('eq','not_eq','contains'))");
    expect(sql).not.toMatch(/EXECUTE\s+.+expected_value/i);
    expect(sql).not.toMatch(/\b(eval|javascript|plv8)\b/i);
  });

  it("uses UUID identities and preserves actor history with user foreign keys", () => {
    const sql = migrationSql();

    expect(sql.match(/id UUID PRIMARY KEY DEFAULT gen_random_uuid\(\)/g)).toHaveLength(7);
    for (const actorColumn of ["created_by", "approved_by", "actor_id", "granted_by", "revoked_by"]) {
      expect(sql).toMatch(
        new RegExp(`${actorColumn} UUID(?: NOT NULL)? REFERENCES public\\.users\\(id\\) ON DELETE SET NULL`),
      );
    }
  });

  it("represents the generation as one non-negative singleton row", () => {
    const sql = migrationSql();

    expect(sql).toContain("singleton BOOLEAN NOT NULL DEFAULT TRUE UNIQUE CHECK (singleton)");
    expect(sql).toContain("generation BIGINT NOT NULL DEFAULT 1 CHECK (generation >= 0)");
    expect(sql).toContain("INSERT INTO public.entitlement_generation(singleton, generation)");
    expect(sql).toContain("VALUES (TRUE, 1)");
  });
});
