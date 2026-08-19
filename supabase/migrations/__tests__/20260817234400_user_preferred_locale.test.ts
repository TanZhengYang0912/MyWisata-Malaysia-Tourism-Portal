import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = new URL("../20260817234400_user_preferred_locale.sql", import.meta.url);

describe("user preferred locale migration contract", () => {
  it("adds a nullable account locale constrained to the supported locales", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("ALTER TABLE public.users");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS preferred_locale TEXT;");
    expect(sql).toContain("preferred_locale IS NULL OR preferred_locale IN ('en', 'zh-CN', 'ms')");
    expect(sql).not.toMatch(/preferred_locale\s+TEXT\s+NOT NULL/i);
  });

  it("does not expose preferred_locale through a public profile view", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW[\s\S]*preferred_locale/i);
  });
});
