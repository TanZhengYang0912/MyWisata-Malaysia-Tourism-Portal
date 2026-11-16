"use client";

import { createInstance, type i18n, type Resource } from 'i18next';
import { I18nextProvider, initReactI18next, type ReportNamespaces } from 'react-i18next';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { APP_LOCALES, type AppLocale } from '@/lib/i18n/locale';
import { APP_NAMESPACES, loadLocaleNamespace, type AppNamespace, type AppResources } from '@/lib/i18n/resources';

export type AppI18nResources = Partial<Record<AppLocale, Partial<AppResources>>>;

interface AppI18nProviderProps {
  locale: AppLocale;
  resources: AppI18nResources;
  /** Namespaces the server sent only part of (see selectPageResources). */
  partialNamespaces?: AppNamespace[];
  children: React.ReactNode;
}

const NO_PARTIAL_NAMESPACES: AppNamespace[] = [];

/** Runs after the page has loaded and the browser is idle, so the fill-in never competes with first paint or hydration. */
function whenLoadedAndIdle(task: () => void): () => void {
  let idleHandle: number | undefined;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const scheduleIdle = () => {
    if (typeof window.requestIdleCallback === 'function') idleHandle = window.requestIdleCallback(task);
    else timeoutHandle = setTimeout(task, 1);
  };

  if (document.readyState === 'complete') scheduleIdle();
  else window.addEventListener('load', scheduleIdle, { once: true });

  return () => {
    window.removeEventListener('load', scheduleIdle);
    if (idleHandle !== undefined) window.cancelIdleCallback(idleHandle);
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  };
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

export function AppI18nProvider({ locale, resources, partialNamespaces = NO_PARTIAL_NAMESPACES, children }: AppI18nProviderProps) {
  const pathname = usePathname();
  const [completeNamespaces] = useState(() => new Set<string>());
  const [instance] = useState(() => {
    const nextInstance = createInstance();
    void nextInstance.use(initReactI18next).init({
      lng: locale,
      resources: asI18nextResources(resources),
      supportedLngs: [...APP_LOCALES],
      ns: [...APP_NAMESPACES],
      defaultNS: 'common',
      fallbackLng: false,
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

  // Slim pages (browse pages) are sent only the copy they render. Fill in the rest in the background so an
  // in-app jump to another area finds its copy ready. Re-runs on navigation, which also retries a failed load.
  useEffect(() => {
    const sent = resources[locale] ?? {};
    const missing = APP_NAMESPACES.filter((namespace) => {
      if (completeNamespaces.has(`${locale}:${namespace}`)) return false;
      return !sent[namespace] || partialNamespaces.includes(namespace);
    });
    if (missing.length === 0) return;
    // i18next stores `resources` by reference and merges into it, so note what was absent before loading.
    const absent = new Set(missing.filter((namespace) => !sent[namespace]));

    let cancelled = false;
    const cancelSchedule = whenLoadedAndIdle(() => {
      void Promise.all(missing.map(async (namespace) => {
        try {
          const data = await loadLocaleNamespace(locale, namespace);
          if (cancelled) return false;
          instance.addResourceBundle(locale, namespace, data, true, true);
          completeNamespaces.add(`${locale}:${namespace}`);
          // Only a namespace that was entirely absent can be showing raw keys; completing a partial one
          // (admin's share copy) changes nothing on screen, so it must not re-render the whole page.
          return absent.has(namespace);
        } catch (error) {
          console.error(`Unable to load ${locale}/${namespace} translations`, error);
          return false;
        }
      })).then((addedAbsent) => {
        if (cancelled) return;
        // react-i18next attaches this at runtime but ships its type augmentation commented out.
        const { reportNamespaces } = instance as i18n & { reportNamespaces?: ReportNamespaces };
        const used = reportNamespaces?.getUsedNamespaces() ?? [];
        const needsRefresh = missing.some((namespace, index) => addedAbsent[index] && used.includes(namespace));
        if (needsRefresh) instance.emit('languageChanged', instance.language);
      });
    });

    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [completeNamespaces, instance, locale, partialNamespaces, pathname, resources]);

  return (
    <I18nextProvider i18n={instance}>
      {children}
    </I18nextProvider>
  );
}
