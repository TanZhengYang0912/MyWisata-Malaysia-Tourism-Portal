import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261117173500_update_customer_trip_dates.sql", "utf8");

describe("customer trip date update migration contract", () => {
  it("locks the owner-scoped trip row and checks the expected version before writing", () => {
    expect(sql).toContain("WHERE id = p_trip_id AND user_id = auth.uid()");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("t.updated_at IS DISTINCT FROM p_expected_version");
  });

  it("shifts scheduled items and validates the complete schedule atomically", () => {
    expect(sql).toContain("scheduled_date = scheduled_date + v_day_delta");
    expect(sql).toContain("PERFORM app_private.assert_trip_schedule(t.id)");
    expect(sql).toContain("SET start_date = p_start_date");
  });

  it("avoids writes for unchanged dates and grants only authenticated execution", () => {
    expect(sql).toContain("IF t.start_date = p_start_date AND t.end_date = p_end_date THEN");
    expect(sql).toContain("FROM PUBLIC,anon,authenticated,service_role");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
