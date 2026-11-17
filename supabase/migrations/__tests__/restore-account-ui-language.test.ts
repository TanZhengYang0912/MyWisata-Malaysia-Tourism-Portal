import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../20261117112128_restore_account_ui_language.sql", import.meta.url), "utf8");

describe("restore account interface language migration", () => {
  it("restores the locale field without changing Auth mail and metadata", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS preferred_locale text");
    expect(sql).toContain("CHECK (preferred_locale IS NULL OR preferred_locale IN ('en', 'zh-CN', 'ms'))");
    expect(sql).not.toMatch(/\bauth\.users\b|CREATE TRIGGER|email_outbox|raw_user_meta_data/);
  });

  it("limits reads and updates to the authenticated caller and skips unchanged writes", () => {
    expect(sql).toContain("WHERE id = (SELECT auth.uid())");
    expect(sql).toContain("caller uuid := auth.uid()");
    expect(sql).toContain("WHERE id = caller AND preferred_locale IS DISTINCT FROM p_locale");
    expect(sql.match(/SECURITY INVOKER SET search_path = ''/g)).toHaveLength(2);
    expect(sql.match(/SECURITY DEFINER SET search_path = ''/g)).toHaveLength(2);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO authenticated;/);
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
