import { describe, expect, it } from "vitest";
import { mapRedemptionStationStats } from "@/lib/vendor/redemption-station-stats";

describe("mapRedemptionStationStats", () => {
  it("maps the redemptions API counters to the scanner cards", () => {
    expect(mapRedemptionStationStats({
      totalCount: 6,
      todayCount: 2,
      voucherCount: 1,
      ticketCount: 1,
      retailCount: 3,
      eventPickupCount: 2,
      foodOrderCount: 0,
      activeOutletsCount: 1,
    })).toEqual({
      todayScans: 2,
      ticketAdmissions: 1,
      voucherRedemptions: 1,
      retailPickups: 3,
      eventPickups: 2,
      foodOrders: 0,
    });
  });

  it("uses zero counters before the API data is available", () => {
    expect(mapRedemptionStationStats()).toEqual({
      todayScans: 0,
      ticketAdmissions: 0,
      voucherRedemptions: 0,
      retailPickups: 0,
      eventPickups: null,
      foodOrders: null,
    });
  });

  it("never reports an unreported counter as zero", () => {
    const mapped = mapRedemptionStationStats({ todayCount: 1, retailCount: 1 });
    expect(mapped.eventPickups).toBeNull();
    expect(mapped.foodOrders).toBeNull();
  });
});
