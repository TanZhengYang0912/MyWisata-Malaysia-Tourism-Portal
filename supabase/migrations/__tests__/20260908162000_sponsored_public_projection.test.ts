import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260908162000_sponsored_public_projection.sql",
);

function migrationSql() {
  expect(existsSync(migrationPath), "sponsored public projection migration must exist").toBe(true);
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}

describe("sponsored placement public projection hardening", () => {
  it("removes public base-table reads while preserving Staff RLS reads", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/REVOKE SELECT ON TABLE public\.sponsored_discovery_placements FROM anon, authenticated/i);
    expect(sql).toMatch(/DROP POLICY IF EXISTS sponsored_discovery_placements_public_active_read/i);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.sponsored_discovery_placements TO authenticated, service_role/i);
    expect(sql).not.toMatch(/GRANT SELECT ON TABLE public\.sponsored_discovery_placements TO anon/i);
  });

  it("publishes only the eight customer-safe fields through a fixed no-argument RPC", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.list_active_sponsored_discovery_placements\(\)/i);
    expect(sql).toMatch(/RETURNS TABLE\s*\(\s*id UUID,\s*product_id UUID,\s*state TEXT,\s*category_slug TEXT,\s*starts_at TIMESTAMPTZ,\s*ends_at TIMESTAMPTZ,\s*priority INTEGER,\s*status TEXT\s*\)/i);
    expect(sql).toMatch(/LANGUAGE sql[\s\S]+STABLE[\s\S]+SECURITY DEFINER[\s\S]+SET search_path = public, pg_temp/i);
    expect(sql).toMatch(/WHERE placement\.status = 'approved'[\s\S]+placement\.starts_at <= now\(\)[\s\S]+now\(\) < placement\.ends_at/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_active_sponsored_discovery_placements\(\)\s+TO anon, authenticated, service_role/i);
  });

  it("does not project internal review or audit fields", () => {
    const sql = migrationSql();
    const functionBody = sql.match(/CREATE OR REPLACE FUNCTION public\.list_active_sponsored_discovery_placements\(\)[\s\S]+?\$\$;/i)?.[0] ?? "";

    expect(functionBody).not.toMatch(/created_by|approved_by|approved_at|review_note|created_at|updated_at|actor_id|before_data|after_data/i);
  });

  it("routes customer Explore reads through the safe projection", () => {
    const exploreSource = readFileSync(
      resolve(process.cwd(), "app/customer/explore/explore-client.tsx"),
      "utf8",
    );

    expect(exploreSource).toContain('.rpc("list_active_sponsored_discovery_placements")');
    expect(exploreSource).not.toContain('.from("sponsored_discovery_placements")');
  });
});
