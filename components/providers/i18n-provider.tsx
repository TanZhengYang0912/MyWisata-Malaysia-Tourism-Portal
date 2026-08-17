"use client";

import { createInstance, type i18n, type Resource } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { useEffect, useState } from 'react';
import { APP_LOCALES, type AppLocale } from '@/lib/i18n/locale';
import { APP_NAMESPACES, type AppResources } from '@/lib/i18n/resources';

export type AppI18nResources = Partial<Record<AppLocale, AppResources>>;

interface AppI18nProviderProps {
  locale: AppLocale;
  resources: AppI18nResources;
  children: React.ReactNode;
}

function asI18nextResources(resources: AppI18nResources): Resource {
  return resources as unknown as Resource;
}

function mergeResources(instance: i18n, resources: AppI18nResources) {
  for (const locale of APP_LOCALES) {
    const localeResources = resources[locale];
    if (!localeResources) continue;

    for (const namespace of APP_NAMESPACES) {
      const namespaceResources = localeResources[namespace];
      if (!namespaceResources) continue;
      instance.addResourceBundle(locale, namespace, namespaceResources, true, true);
    }
  }
}

export function AppI18nProvider({ locale, resources, children }: AppI18nProviderProps) {
  const [instance] = useState(() => {
    const nextInstance = createInstance();
    void nextInstance.use(initReactI18next).init({
      lng: locale,
      resources: asI18nextResources(resources),
      supportedLngs: [...APP_LOCALES],
      ns: [...APP_NAMESPACES],
      defaultNS: 'common',
      fallbackLng: 'en',
      fallbackNS: 'common',
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
    return nextInstance;
  });

  useEffect(() => {
    mergeResources(instance, resources);
  }, [instance, resources]);

  useEffect(() => {
    if (instance.language !== locale) void instance.changeLanguage(locale);
  }, [instance, locale]);

  return (
    <I18nextProvider i18n={instance}>
      {children}
    </I18nextProvider>
  );
}
