'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';

interface Props { page: number; totalPages: number; total: number; pageSize: number; onPageChange: (page: number) => void }

export default function PaginationControls({ page, totalPages, total, pageSize, onPageChange }: Props) {
  const { t: tVendor } = useTranslation('vendor');
  const { t: tCommon, i18n } = useTranslation('common');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  if (!total) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
      <span>{tVendor('pagination.showing', { first: formatNumber(first, locale), last: formatNumber(last, locale), total: formatNumber(total, locale), defaultValue: 'Showing {{first}}–{{last}} of {{total}}' })}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label={tCommon('accessibility.previousPage', { defaultValue: 'Previous page' })} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={14} /> {tCommon('actions.previous', { defaultValue: 'Previous' })}</button>
        <span className="px-2 font-semibold text-gray-800">{tVendor('pagination.page', { current: formatNumber(page, locale), total: formatNumber(totalPages, locale), defaultValue: 'Page {{current}} of {{total}}' })}</span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label={tCommon('accessibility.nextPage', { defaultValue: 'Next page' })} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">{tCommon('actions.next', { defaultValue: 'Next' })} <ChevronRight size={14} /></button>
      </div>
    </div>
  );
}
