'use client';

import { useTranslation } from 'react-i18next';
import { formatNumber } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';

export type AdminSegmentedFilterItem = {
  value: string;
  label: string;
  count?: number;
};

type Props = {
  value: string;
  items: AdminSegmentedFilterItem[];
  onChange: (value: string) => void;
  ariaLabel: string;
};

/** Shared filter presentation; callers retain ownership of filter behavior. */
export function AdminSegmentedFilter({ value, items, onChange, ariaLabel }: Props) {
  const { t, i18n } = useTranslation('admin');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  return (
    <div role="tablist" aria-label={t(ariaLabel, { defaultValue: ariaLabel })} className="flex w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1">
      {items.map((item) => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${active ? 'bg-[#010066] text-white shadow-sm' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
          >
            {t(`filters.${item.value}`, { defaultValue: item.label })}
            {item.count !== undefined && <span className={active ? 'text-white/70' : 'text-muted-foreground/70'}>{formatNumber(item.count, locale)}</span>}
          </button>
        );
      })}
    </div>
  );
}
