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

const MYR_DISPLAY_LOCALE = "en-MY";

/**
 * Formats the numeric part of a Ringgit amount for use inside translated
 * sentences. The currency symbol belongs to the translation in this case.
 * Negative input is normalized to its absolute amount so money displays
 * never render a negative value.
 */
export function formatMYRNumber(value: number, _locale: AppLocale = "en", options: Intl.NumberFormatOptions = {}): string {
  const absoluteValue = Math.abs(value);
  return new Intl.NumberFormat(MYR_DISPLAY_LOCALE, {
    ...options,
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absoluteValue);
}

/** Formats a Ringgit amount as RM34,000.00 across every app locale. */
export function formatMYR(value: number, locale: AppLocale = "en", options: Intl.NumberFormatOptions = {}): string {
  return `RM${formatMYRNumber(value, locale, options)}`;
}

/** Formats an integer sen amount using the same RM display contract. */
export function formatMYRFromSen(valueSen: number, locale: AppLocale = "en", options: Intl.NumberFormatOptions = {}): string {
  return formatMYR(valueSen / 100, locale, options);
}
