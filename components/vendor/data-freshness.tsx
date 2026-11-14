'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';

/**
 * "Updated 10:32 · Refresh" for server-rendered Vendor figures (Dashboard,
 * Analytics). `generatedAt` is the server render time, so it changes whenever
 * DashboardRealtime or this button re-renders the page with fresh data.
 */
export function DataFreshness({ generatedAt }: { generatedAt: string }) {
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const time = formatDateTime(generatedAt, locale, { timeZone: 'Asia/Kuala_Lumpur', timeStyle: 'short' });

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <span className="tabular-nums">{t('ui.dataFreshness.updatedAt', { time })}</span>
      <button
        type="button"
        onClick={() => startRefresh(() => router.refresh())}
        disabled={isRefreshing}
        aria-label={t('ui.dataFreshness.refresh')}
        title={t('ui.dataFreshness.refresh')}
        className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
      >
        <RefreshCw size={14} className={isRefreshing ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
      </button>
    </div>
  );
}
