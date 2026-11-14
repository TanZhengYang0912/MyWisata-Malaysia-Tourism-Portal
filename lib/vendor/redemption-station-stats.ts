export interface RedemptionApiStats {
  totalCount?: number;
  todayCount?: number;
  voucherCount?: number;
  ticketCount?: number;
  retailCount?: number;
  eventPickupCount?: number;
  foodOrderCount?: number;
  activeOutletsCount?: number;
}

export interface RedemptionStationStats {
  todayScans: number;
  ticketAdmissions: number;
  voucherRedemptions: number;
  retailPickups: number;
  /** null when the server does not report this counter yet (never shown as 0). */
  eventPickups: number | null;
  foodOrders: number | null;
}

export const EMPTY_REDEMPTION_STATION_STATS: RedemptionStationStats = {
  todayScans: 0,
  ticketAdmissions: 0,
  voucherRedemptions: 0,
  retailPickups: 0,
  eventPickups: null,
  foodOrders: null,
};

export function mapRedemptionStationStats(stats?: RedemptionApiStats): RedemptionStationStats {
  return {
    todayScans: stats?.todayCount ?? 0,
    ticketAdmissions: stats?.ticketCount ?? 0,
    voucherRedemptions: stats?.voucherCount ?? 0,
    retailPickups: stats?.retailCount ?? 0,
    eventPickups: typeof stats?.eventPickupCount === "number" ? stats.eventPickupCount : null,
    foodOrders: typeof stats?.foodOrderCount === "number" ? stats.foodOrderCount : null,
  };
}
