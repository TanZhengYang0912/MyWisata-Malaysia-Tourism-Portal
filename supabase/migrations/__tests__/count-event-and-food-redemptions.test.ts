import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261113231500_count_event_and_food_redemptions.sql"), "utf8");
const previous = readFileSync(resolve(process.cwd(), "supabase/migrations/20261109084435_reconcile_qr_redemption_history.sql"), "utf8");
const rows = (sql: string) => sql.slice(sql.indexOf("), records AS ("), sql.indexOf("), filtered AS ("));

describe("event pickup and food scan counters migration", () => {
  it("counts every committed scan kind in the stats object", () => {
    expect(migration).toContain("count(*) FILTER (WHERE kind = 'event_pickup')::INTEGER AS event_pickup_count");
    expect(migration).toContain("count(*) FILTER (WHERE kind = 'food_order')::INTEGER AS food_order_count");
    expect(migration).toContain("'eventPickupCount', page_info.event_pickup_count, 'foodOrderCount', page_info.food_order_count");
  });

  it("keeps the existing signature, row sources, scope and stats keys", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.list_vendor_redemption_history(");
    expect(rows(migration)).toBe(rows(previous));
    for (const key of ["'totalCount'", "'todayCount'", "'voucherCount'", "'ticketCount'", "'activeOutletsCount'", "'retailCount'"]) {
      expect(migration).toContain(key);
    }
    expect(migration).toContain("least(50, greatest(1, coalesce(p_page_size, 15)))");
  });
});
