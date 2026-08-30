import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = resolve(process.cwd(), "supabase/migrations/20260830133000_disable_production_demo_purchase.sql");

describe("production Demo Purchase isolation migration", () => {
  it("defaults demo mode off and removes the development RPC", () => {
    expect(existsSync(path)).toBe(true);
    if (!existsSync(path)) return;
    const sql = readFileSync(path, "utf8");

    expect(sql).toMatch(/SET value = 'false'[\s\S]+WHERE key = 'demo\.mode'/i);
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.create_demo_purchase(UUID, UUID, UUID)");
    expect(sql).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.create_demo_purchase/i);
  });
});
