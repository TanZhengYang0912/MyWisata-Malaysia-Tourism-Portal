import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260921214000_allow_partial_booking_checkins.sql"),
  "utf8",
);

describe("partial ticket admission booking status", () => {
  it("allows the in-use state written by partial multi-entry admissions", () => {
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS bookings_status_check/i);
    expect(migration).toMatch(/ADD CONSTRAINT bookings_status_check\s+CHECK/i);
    expect(migration).toMatch(/'confirmed'[\s\S]*'in_use'[\s\S]*'checked_in'[\s\S]*'no_show'[\s\S]*'cancelled'/i);
  });
});
