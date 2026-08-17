import { headers } from 'next/headers';
import { getT, initServerI18next } from 'next-i18next/server';
import type { TFunction } from 'i18next';
import i18nConfig from '@/i18n.config';
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from './locale';
import type { AppNamespace } from './resources';

initServerI18next({
  ...i18nConfig,
  supportedLngs: [...i18nConfig.supportedLngs],
  ns: [...i18nConfig.ns],
});

export async function getRequestLocale(): Promise<AppLocale> {
  const requestHeaders = await headers();
  const locale = requestHeaders.get('x-app-locale');
  return isAppLocale(locale) ? locale : DEFAULT_LOCALE;
}

export async function getServerTranslation(
  namespace: AppNamespace,
): Promise<{ locale: AppLocale; t: TFunction }> {
  const locale = await getRequestLocale();
  const { t } = await getT(namespace, { lng: locale });
  return { locale, t };
}
