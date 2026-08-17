import type { AppLocale } from "./locale";

type DateValue = Date | number | string;

function asDate(value: DateValue): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid date value");
  return date;
}

function dateTimeOptions(
  options: Intl.DateTimeFormatOptions,
  defaults: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormatOptions {
  if (options.dateStyle !== undefined || options.timeStyle !== undefined) return options;
  return { ...defaults, ...options };
}

export function formatDate(
  value: DateValue,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, dateTimeOptions(options, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })).format(asDate(value));
}

export function formatDateTime(
  value: DateValue,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, dateTimeOptions(options, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })).format(asDate(value));
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
