import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260910005600_sponsored_placement_staff_role_template.sql",
);

function migrationSql() {
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}

describe("Sponsored Placement Manager staff role template migration", () => {
  it("refuses to overwrite an existing custom role with the reserved template name", () => {
    const sql = migrationSql();
    const guardIndex = sql.indexOf("sponsored_placement_manager_role_name_conflict");
    const insertIndex = sql.indexOf("INSERT INTO public.staff_roles");

    expect(sql).toMatch(
      /IF EXISTS[\s\S]*staff_roles[\s\S]*name = 'Sponsored Placement Manager'[\s\S]*is_system IS NOT TRUE[\s\S]*RAISE EXCEPTION 'sponsored_placement_manager_role_name_conflict'/,
    );
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(insertIndex);
  });

  it("creates one immutable active system template idempotently", () => {
    const sql = migrationSql();

    expect(existsSync(migrationPath)).toBe(true);
    expect(sql).toContain("'Sponsored Placement Manager'");
    expect(sql).toMatch(
      /INSERT INTO public\.staff_roles[\s\S]*TRUE,\s+TRUE,\s+NULL/,
    );
    expect(sql).toMatch(/ON CONFLICT \(name\) DO UPDATE SET[\s\S]*is_system = TRUE[\s\S]*is_active = TRUE/);
  });

  it("reconciles the template to only the existing sponsored placement permission", () => {
    const sql = migrationSql();

    expect(sql).toContain("'admin.map_campaign.manage'");
    expect(sql).toMatch(/DELETE FROM public\.staff_role_permissions[\s\S]*Sponsored Placement Manager/);
    expect(sql).toMatch(/INSERT INTO public\.staff_role_permissions[\s\S]*admin\.map_campaign\.manage[\s\S]*ON CONFLICT \(role_id, permission_id\) DO NOTHING/);
    expect(sql).not.toMatch(/INSERT INTO public\.staff_permissions/);
    expect(sql).not.toMatch(/INSERT INTO public\.staff_role_assignments/);
    expect(sql).not.toMatch(/INSERT INTO public\.staff_invitations/);
  });
});
