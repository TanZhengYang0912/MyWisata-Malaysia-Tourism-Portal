import "server-only";

import type { ForeignReferenceCurrency, ReferenceCurrency } from "./reference";

const RATE_REVALIDATE_SECONDS = 60 * 60 * 24;
const RATE_TIMEOUT_MS = 5_000;
const RATE_API_URL = "https://api.frankfurter.dev/v2/rates";

export type ReferenceRateSnapshot = {
  base: "MYR";
  quote: ForeignReferenceCurrency;
  rate: number;
  date: string;
  provider: "BNM";
};

function isIsoDate(value: unknown): value is string {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

function normalizeRateRow(value: unknown, currency: ForeignReferenceCurrency): ReferenceRateSnapshot | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  if (
    row.base !== "MYR"
    || row.quote !== currency
    || !isIsoDate(row.date)
    || typeof row.rate !== "number"
    || !Number.isFinite(row.rate)
    || row.rate <= 0
  ) {
    return null;
  }

  return {
    base: "MYR",
    quote: currency,
    rate: row.rate,
    date: row.date,
    provider: "BNM",
  };
}

export async function getReferenceRate(
  currency: ReferenceCurrency,
  fetcher: typeof fetch = fetch,
): Promise<ReferenceRateSnapshot | null> {
  if (currency === "MYR") return null;

  const url = `${RATE_API_URL}?base=MYR&quotes=${currency}&providers=BNM`;

  try {
    const response = await fetcher(url, {
      cache: "force-cache",
      next: { revalidate: RATE_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(RATE_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || payload.length !== 1) return null;

    return normalizeRateRow(payload[0], currency);
  } catch {
    return null;
  }
}
