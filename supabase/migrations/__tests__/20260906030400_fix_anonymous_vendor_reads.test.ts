import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260906030400_fix_anonymous_vendor_reads.sql",
);

function migrationSql() {
  expect(existsSync(migrationPath), "anonymous Vendor read repair migration must exist").toBe(true);
  return readFileSync(migrationPath, "utf8");
}

describe("anonymous Vendor read repair migration", () => {
  it("separates anonymous public reads from authenticated staff checks", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/DROP POLICY IF EXISTS vendors_read_only_access ON public\.vendors/i);
    expect(sql).toMatch(
      /CREATE POLICY vendors_public_read[\s\S]+ON public\.vendors[\s\S]+FOR SELECT[\s\S]+TO anon[\s\S]+USING\s*\(\s*status\s*=\s*'approved'\s*\)/i,
    );
    expect(sql).toMatch(
      /CREATE POLICY vendors_authenticated_read[\s\S]+ON public\.vendors[\s\S]+FOR SELECT[\s\S]+TO authenticated[\s\S]+owner_id\s*=\s*auth\.uid\(\)[\s\S]+has_staff_permission\s*\(\s*auth\.uid\(\),\s*'admin\.vendor\.manage'\s*\)/i,
    );
  });

  it("does not grant anonymous execution of staff permission functions", () => {
    const sql = migrationSql();

    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.has_staff_permission\(UUID, TEXT\) TO[^;]*anon/i);
    const publicPolicy = sql.slice(
      sql.indexOf("CREATE POLICY vendors_public_read"),
      sql.indexOf("CREATE POLICY vendors_authenticated_read"),
    );
    expect(publicPolicy).not.toContain("has_staff_permission");
  });
});
