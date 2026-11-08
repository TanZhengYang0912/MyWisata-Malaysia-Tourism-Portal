import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261106010022_voucher_view_once_per_day.sql"), "utf8");

describe("voucher view once per day migration", () => {
  it("allows one view per customer, voucher and Malaysian day from the cutoff", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS voucher_events_one_view_per_day\s+ON public\.voucher_events \(voucher_id, user_id, \(timezone\('Asia\/Kuala_Lumpur', created_at\)::date\)\)/);
    expect(sql).toMatch(/WHERE event_type = 'viewed'\s+AND user_id IS NOT NULL\s+AND created_at >= '2026-11-07 00:00:00\+08'/);
  });

  it("only removes duplicate views inside the covered window and keeps the earliest", () => {
    const cleanup = sql.slice(sql.indexOf("DELETE FROM"), sql.indexOf("CREATE UNIQUE INDEX"));
    expect(cleanup).toContain("dup.created_at >= '2026-11-07 00:00:00+08'");
    expect(cleanup).toContain("dup.event_type = 'viewed'");
    expect(cleanup).toContain("(keep.created_at, keep.id) < (dup.created_at, dup.id)");
  });
});
