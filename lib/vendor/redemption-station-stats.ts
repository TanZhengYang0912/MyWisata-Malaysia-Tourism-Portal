export interface RedemptionApiStats {
  totalCount?: number;
  todayCount?: number;
  voucherCount?: number;
  ticketCount?: number;
  retailCount?: number;
  activeOutletsCount?: number;
}

export interface RedemptionStationStats {
  todayScans: number;
  ticketAdmissions: number;
  voucherRedemptions: number;
  retailPickups: number;
}

export function mapRedemptionStationStats(stats?: RedemptionApiStats): RedemptionStationStats {
  return {
    todayScans: stats?.todayCount ?? 0,
    ticketAdmissions: stats?.ticketCount ?? 0,
    voucherRedemptions: stats?.voucherCount ?? 0,
    retailPickups: stats?.retailCount ?? 0,
  };
}
