import { describe, expect, it } from "vitest";
import { mapRedemptionStationStats } from "@/lib/vendor/redemption-station-stats";

describe("mapRedemptionStationStats", () => {
  it("maps the redemptions API counters to the scanner cards", () => {
    expect(mapRedemptionStationStats({
      totalCount: 4,
      todayCount: 2,
      voucherCount: 1,
      ticketCount: 1,
      retailCount: 3,
      activeOutletsCount: 1,
    })).toEqual({
      todayScans: 2,
      ticketAdmissions: 1,
      voucherRedemptions: 1,
      retailPickups: 3,
    });
  });

  it("uses zero counters before the API data is available", () => {
    expect(mapRedemptionStationStats()).toEqual({
      todayScans: 0,
      ticketAdmissions: 0,
      voucherRedemptions: 0,
      retailPickups: 0,
    });
  });
});
