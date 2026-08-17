import type { AppLocale } from "./locale";

type DateValue = Date | number | string;

function asDate(value: DateValue): Date {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(
  value: DateValue,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options,
  }).format(asDate(value));
}

export function formatDateTime(
  value: DateValue,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  }).format(asDate(value));
}

export function formatNumber(value: number, locale: AppLocale, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatMYR(value: number, locale: AppLocale, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(locale, {
    ...options,
    style: "currency",
    currency: "MYR",
  }).format(value);
}
