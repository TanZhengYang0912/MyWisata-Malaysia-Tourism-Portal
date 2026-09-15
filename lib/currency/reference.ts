export const REFERENCE_CURRENCIES = ["MYR", "SGD", "USD", "CNY", "EUR"] as const;

export type ReferenceCurrency = (typeof REFERENCE_CURRENCIES)[number];
export type ForeignReferenceCurrency = Exclude<ReferenceCurrency, "MYR">;

export const REFERENCE_CURRENCY_COOKIE = "MYWISATA_CURRENCY";
export const DEFAULT_REFERENCE_CURRENCY: ReferenceCurrency = "MYR";

const REFERENCE_CURRENCY_SYMBOLS: Record<ForeignReferenceCurrency, string> = {
  SGD: "S$",
  USD: "US$",
  CNY: "¥",
  EUR: "€",
};

export function isReferenceCurrency(value: unknown): value is ReferenceCurrency {
  return typeof value === "string" && REFERENCE_CURRENCIES.includes(value as ReferenceCurrency);
}

export function resolveReferenceCurrency(value: unknown): ReferenceCurrency {
  return isReferenceCurrency(value) ? value : DEFAULT_REFERENCE_CURRENCY;
}

export function convertMYR(amountMYR: number, rate: number): number | null {
  if (!Number.isFinite(amountMYR) || amountMYR < 0 || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  return amountMYR * rate;
}

export function formatReferenceCurrency(
  amount: number,
  currency: ForeignReferenceCurrency,
  locale: string,
): string {
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${REFERENCE_CURRENCY_SYMBOLS[currency]}${value}`;
}
