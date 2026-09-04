export const CUSTOMER_HISTORY_TYPES = ["all", "topup", "spend", "earnings", "withdrawals", "refund", "adjustment"] as const;
export const CUSTOMER_HISTORY_DIRECTIONS = ["all", "credit", "debit"] as const;
export const CUSTOMER_HISTORY_PAGE_SIZE = 25;

export type CustomerHistoryFilters = {
  type: typeof CUSTOMER_HISTORY_TYPES[number];
  direction: typeof CUSTOMER_HISTORY_DIRECTIONS[number];
  from: string;
  to: string;
  page: number;
};

export const DEFAULT_CUSTOMER_HISTORY_FILTERS: CustomerHistoryFilters = {
  type: "all", direction: "all", from: "", to: "", page: 1,
};

const TYPE_GROUPS = {
  topup: ["topup"],
  spend: ["spend"],
  earnings: ["earnings", "earnings_pending", "earnings_confirm", "earnings_reverse"],
  withdrawals: ["withdrawal_reserve", "withdrawal_cancel"],
  refund: ["refund"],
  adjustment: ["adjustment_credit", "adjustment_debit"],
};

type CustomerHistoryQuery = {
  ok: true;
  offset: number;
  pageSize: number;
  types?: string[];
  direction?: "credit" | "debit";
  fromInclusive?: string;
  toExclusive?: string;
} | { ok: false; error: "invalidDate" | "invalidRange" | "invalidFilter" };

function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function buildCustomerHistoryQuery(filters: CustomerHistoryFilters): CustomerHistoryQuery {
  if (!CUSTOMER_HISTORY_TYPES.includes(filters.type) || !CUSTOMER_HISTORY_DIRECTIONS.includes(filters.direction)
    || !Number.isSafeInteger(filters.page) || filters.page < 1
    || !Number.isSafeInteger(filters.page * CUSTOMER_HISTORY_PAGE_SIZE)) {
    return { ok: false, error: "invalidFilter" };
  }
  if ((filters.from && !validCalendarDate(filters.from)) || (filters.to && !validCalendarDate(filters.to))) {
    return { ok: false, error: "invalidDate" };
  }
  if (filters.from && filters.to && filters.from > filters.to) return { ok: false, error: "invalidRange" };

  // Calendar dates are Malaysia days, independent of the browser's time zone.
  return {
    ok: true,
    offset: (filters.page - 1) * CUSTOMER_HISTORY_PAGE_SIZE,
    pageSize: CUSTOMER_HISTORY_PAGE_SIZE,
    ...(filters.type !== "all" ? { types: TYPE_GROUPS[filters.type] } : {}),
    ...(filters.direction !== "all" ? { direction: filters.direction } : {}),
    ...(filters.from ? { fromInclusive: new Date(`${filters.from}T00:00:00+08:00`).toISOString() } : {}),
    ...(filters.to ? { toExclusive: new Date(new Date(`${filters.to}T00:00:00+08:00`).getTime() + 86400000).toISOString() } : {}),
  };
}
