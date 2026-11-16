import { isCustomerBrowsePath } from "@/lib/auth/public-customer-paths";
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

const localeCache = new Map<AppLocale, Promise<AppResources>>();

export function loadLocaleResources(locale: AppLocale): Promise<AppResources> {
  const cached = localeCache.get(locale);
  if (cached) return cached;

  const promise = (async () => {
    const entries = await Promise.all(
      APP_NAMESPACES.map(async (namespace) => [namespace, await resourceLoaders[locale][namespace]()] as const),
    );
    return Object.fromEntries(entries) as AppResources;
  })();

  localeCache.set(locale, promise);
  return promise;
}


const namespaceCache = new Map<string, Promise<Record<string, unknown>>>();

/** One namespace on its own, for filling in what a slim page was sent. A failure clears the cache so a later call retries. */
export function loadLocaleNamespace(locale: AppLocale, namespace: AppNamespace): Promise<Record<string, unknown>> {
  const key = `${locale}:${namespace}`;
  const cached = namespaceCache.get(key);
  if (cached) return cached;

  const promise = resourceLoaders[locale][namespace]().catch((error: unknown) => {
    namespaceCache.delete(key);
    throw error;
  });
  namespaceCache.set(key, promise);
  return promise;
}

/**
 * Browse pages are the high-traffic public pages, so their HTML carries only the copy they render:
 * the share button and its affiliate QR read `admin.share` and `admin.affiliate.qr`. Every other path
 * keeps the full set. The client fills in the rest once the page is idle (see AppI18nProvider).
 */
export function selectPageResources(
  resources: AppResources,
  pathname: string,
): { resources: Partial<AppResources>; partialNamespaces: AppNamespace[] } {
  if (!isCustomerBrowsePath(pathname)) return { resources, partialNamespaces: [] };

  const admin = resources.admin as { share?: unknown; affiliate?: { qr?: unknown } };
  return {
    resources: {
      common: resources.common,
      auth: resources.auth,
      customer: resources.customer,
      admin: { share: admin.share, affiliate: { qr: admin.affiliate?.qr } },
    },
    partialNamespaces: ["admin"],
  };
}
