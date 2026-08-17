import type { AppLocale } from "./locale";

export const APP_NAMESPACES = ["common", "auth", "customer", "vendor", "admin"] as const;
export type AppNamespace = (typeof APP_NAMESPACES)[number];
export type AppResources = Record<AppNamespace, Record<string, unknown>>;

type ResourceLoader = () => Promise<Record<string, unknown>>;

const resourceLoaders: Record<AppLocale, Record<AppNamespace, ResourceLoader>> = {
  en: {
    common: async () => (await import("../../app/i18n/locales/en/common.json")).default,
    auth: async () => (await import("../../app/i18n/locales/en/auth.json")).default,
    customer: async () => (await import("../../app/i18n/locales/en/customer.json")).default,
    vendor: async () => (await import("../../app/i18n/locales/en/vendor.json")).default,
    admin: async () => (await import("../../app/i18n/locales/en/admin.json")).default,
  },
  "zh-CN": {
    common: async () => (await import("../../app/i18n/locales/zh-CN/common.json")).default,
    auth: async () => (await import("../../app/i18n/locales/zh-CN/auth.json")).default,
    customer: async () => (await import("../../app/i18n/locales/zh-CN/customer.json")).default,
    vendor: async () => (await import("../../app/i18n/locales/zh-CN/vendor.json")).default,
    admin: async () => (await import("../../app/i18n/locales/zh-CN/admin.json")).default,
  },
  ms: {
    common: async () => (await import("../../app/i18n/locales/ms/common.json")).default,
    auth: async () => (await import("../../app/i18n/locales/ms/auth.json")).default,
    customer: async () => (await import("../../app/i18n/locales/ms/customer.json")).default,
    vendor: async () => (await import("../../app/i18n/locales/ms/vendor.json")).default,
    admin: async () => (await import("../../app/i18n/locales/ms/admin.json")).default,
  },
};

export async function loadLocaleResources(locale: AppLocale): Promise<AppResources> {
  const entries = await Promise.all(
    APP_NAMESPACES.map(async (namespace) => [namespace, await resourceLoaders[locale][namespace]()] as const),
  );

  return Object.fromEntries(entries) as AppResources;
}
