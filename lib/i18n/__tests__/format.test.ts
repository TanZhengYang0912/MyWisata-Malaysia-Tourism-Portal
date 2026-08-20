import { describe, expect, it } from "vitest";
import { loadLocaleResources } from "../resources";
import { formatDate, formatDateTime, formatMYR, formatNumber } from "../format";
import { CUSTOMER_NAV, ACCOUNT_MENU_GROUPS } from "@/lib/customer/header-navigation";
import { DISCOVERY_CATEGORIES } from "@/lib/customer/discovery-categories";
import { STATUS_LABEL_KEYS } from "@/components/shared/status-badge";
import {
  BUDGET_RANGES,
  DISTANCE_OPTIONS,
  INTEREST_OPTIONS,
  MOBILITY_NEEDS,
} from "@/backend/domains/preferences";

describe("locale-aware formatters", () => {
  it("formats the same numeric MYR value in every supported locale", () => {
    for (const locale of ["en", "zh-CN", "ms"] as const) {
      const formatted = formatMYR(70, locale);

      expect(formatted).toMatch(/MYR|RM/);
      expect(formatted).toMatch(/70(?:[.,]00)?/);
    }
  });

  it("uses the requested locale for dates, date-times, and numbers", () => {
    const value = "2026-03-05T14:06:00.000Z";
    const options = { timeZone: "UTC" } as const;

    expect(formatDate(value, "en", options)).toBe("Mar 5, 2026");
    expect(formatDate(value, "zh-CN", options)).toBe("2026年3月5日");
    expect(formatDateTime(value, "ms", options)).toContain("5 Mac 2026");
    expect(formatNumber(1234567.89, "en")).toBe("1,234,567.89");
    expect(formatNumber(1234567.89, "zh-CN")).toBe("1,234,567.89");
  });

  it("accepts explicit dateStyle/timeStyle options without mixing incompatible defaults", () => {
    const value = "2026-03-05T14:06:00.000Z";
    expect(() => formatDate(value, "en", { dateStyle: "long", timeZone: "UTC" })).not.toThrow();
    expect(() => formatDate(value, "en", { timeStyle: "short", timeZone: "UTC" })).not.toThrow();
    expect(() => formatDateTime(value, "en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })).not.toThrow();
  });

  it("fails explicitly for invalid dates", () => {
    expect(() => formatDate("not-a-date", "en")).toThrow(RangeError);
    expect(() => formatDateTime(new Date(Number.NaN), "en")).toThrow(RangeError);
  });
});

describe("shared translation-key contracts", () => {
  it("keeps shared navigation and account labels as stable keys", () => {
    expect(CUSTOMER_NAV.every((item) => item.labelKey.startsWith("navigation."))).toBe(true);
    expect(ACCOUNT_MENU_GROUPS.every((group) => group.labelKey.startsWith("accountGroups."))).toBe(true);
    expect(ACCOUNT_MENU_GROUPS.flatMap((group) => group.items).every((item) => item.labelKey.startsWith("accountItems."))).toBe(true);
  });

  it("keeps discovery and preference presentation keys separate from stored values", () => {
    expect(DISCOVERY_CATEGORIES.every((category) => category.labelKey.startsWith("categories."))).toBe(true);
    expect(INTEREST_OPTIONS.every((option) => option.labelKey.startsWith("categories."))).toBe(true);
    expect(BUDGET_RANGES.every((option) => option.labelKey.startsWith("preferences.budgetRanges."))).toBe(true);
    expect(MOBILITY_NEEDS.every((option) => option.labelKey.startsWith("preferences.mobilityNeeds."))).toBe(true);
    expect(DISTANCE_OPTIONS.every((option) => option.labelKey.startsWith("preferences.distance."))).toBe(true);
    expect(INTEREST_OPTIONS.map((option) => option.slug)).toEqual(["food", "activity", "accommodation", "retail"]);
  });

  it("resolves every introduced labelKey and status key in every locale", async () => {
    const resources = await Promise.all(["en", "zh-CN", "ms"].map((locale) => loadLocaleResources(locale as "en" | "zh-CN" | "ms")));
    const presentationKeys: Array<["customer", string]> = [
      ...CUSTOMER_NAV.map((item) => ["customer", item.labelKey] as ["customer", string]),
      ...ACCOUNT_MENU_GROUPS.map((group) => ["customer", group.labelKey] as ["customer", string]),
      ...ACCOUNT_MENU_GROUPS.flatMap((group) => group.items.map((item) => ["customer", item.labelKey] as ["customer", string])),
      ...DISCOVERY_CATEGORIES.map((category) => ["customer", category.labelKey] as ["customer", string]),
      ...INTEREST_OPTIONS.map((option) => ["customer", option.labelKey] as ["customer", string]),
      ...BUDGET_RANGES.map((option) => ["customer", option.labelKey] as ["customer", string]),
      ...MOBILITY_NEEDS.map((option) => ["customer", option.labelKey] as ["customer", string]),
      ...DISTANCE_OPTIONS.map((option) => ["customer", option.labelKey] as ["customer", string]),
    ];

    const readPath = (value: unknown, key: string): unknown => key.split(".").reduce<unknown>((current, segment) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[segment];
    }, value);

    for (const resource of resources) {
      for (const [namespace, key] of presentationKeys) {
        const rawValue = readPath(resource[namespace], key);
        const value = rawValue && typeof rawValue === "object" && "label" in rawValue
          ? (rawValue as { label: unknown }).label
          : rawValue;
        expect(typeof value, `${namespace}.${key}`).toBe("string");
        expect((value as string).trim(), `${namespace}.${key}`).not.toBe("");
      }

      for (const key of new Set(Object.values(STATUS_LABEL_KEYS))) {
        const value = readPath(resource.common, key);
        expect(typeof value, `common.${key}`).toBe("string");
        expect((value as string).trim(), `common.${key}`).not.toBe("");
      }
    }

    expect((resources[0].common as { statuses: Record<string, string> }).statuses.completed).toBe("Completed");
    expect((resources[1].common as { statuses: Record<string, string> }).statuses.completed).toBe("已完成");
    expect((resources[2].common as { statuses: Record<string, string> }).statuses.completed).toBe("Selesai");
  });
});
