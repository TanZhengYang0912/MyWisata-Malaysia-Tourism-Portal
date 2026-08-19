import { APP_LOCALES, isAppLocale } from "./lib/i18n/locale";
import { APP_NAMESPACES, AppNamespace, loadLocaleResources } from "./lib/i18n/resources";

const i18nConfig = {
  supportedLngs: APP_LOCALES,
  fallbackLng: "en",
  localeInPath: false,
  ns: APP_NAMESPACES,
  defaultNS: "common",
  resourceLoader: async (locale: string, namespace: string) => {
    if (!isAppLocale(locale) || !APP_NAMESPACES.includes(namespace as AppNamespace)) {
      return {};
    }

    const resources = await loadLocaleResources(locale);
    return resources[namespace as AppNamespace];
  },
};

export default i18nConfig;
