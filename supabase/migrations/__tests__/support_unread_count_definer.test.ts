import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const directory = resolve(process.cwd(), "supabase/migrations");

describe("get_support_unread_count()", () => {
  it("ends up SECURITY DEFINER, because the authenticated role cannot read support_tickets", () => {
    // Walk the migrations in order and keep the last statement that sets the security mode.
    let mode: string | null = null;
    for (const file of readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()) {
      const sql = readFileSync(resolve(directory, file), "utf8");
      const create = sql.match(/CREATE OR REPLACE FUNCTION public\.get_support_unread_count\(\)[\s\S]*?\$\$;/i)?.[0];
      if (create) mode = /SECURITY DEFINER/i.test(create) ? "DEFINER" : "INVOKER";
      for (const alter of sql.matchAll(/ALTER FUNCTION public\.get_support_unread_count\(\)\s+SECURITY\s+(DEFINER|INVOKER)/gi)) mode = alter[1].toUpperCase();
    }
    expect(mode).toBe("DEFINER");
  });
});
