"use client";

import { I18nProvider } from 'next-i18next/client';
import { APP_LOCALES, type AppLocale } from '@/lib/i18n/locale';
import type { AppResources } from '@/lib/i18n/resources';

interface AppI18nProviderProps {
  locale: AppLocale;
  resources: AppResources;
  children: React.ReactNode;
}

export function AppI18nProvider({ locale, resources, children }: AppI18nProviderProps) {
  return (
    <I18nProvider
      language={locale}
      resources={{ [locale]: resources }}
      supportedLngs={[...APP_LOCALES]}
      defaultNS="common"
      fallbackLng="en"
    >
      {children}
    </I18nProvider>
  );
}
