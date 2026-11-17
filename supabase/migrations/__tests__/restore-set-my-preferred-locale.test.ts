import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../20261117110220_restore_set_my_preferred_locale.sql", import.meta.url);

describe("restore account locale RPC migration", () => {
  it("restores the self-only locale update with the established lock and privilege boundaries", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.set_my_preferred_locale\(p_locale text\)/i);
    expect(sql).toMatch(/SECURITY DEFINER SET search_path\s*=\s*''/i);
    expect(sql).toContain("caller uuid := auth.uid()");
    expect(sql).toContain("p_locale NOT IN ('en', 'zh-CN', 'ms')");
    expect(sql.indexOf("FROM auth.users WHERE id = caller FOR UPDATE")).toBeLessThan(
      sql.indexOf("UPDATE public.users"),
    );
    expect(sql).toContain("WHERE id = caller");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.set_my_preferred_locale\(text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.set_my_preferred_locale\(text\) TO authenticated/i);
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
