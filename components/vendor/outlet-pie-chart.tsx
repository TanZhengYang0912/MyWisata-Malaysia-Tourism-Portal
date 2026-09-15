'use client';

import { ShoppingBag } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMYR, formatNumber } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';

interface ProductSale {
  name: string;
  revenue: number;
  color: string;
}

const OTHERS_COLOR = '#cbd5e1';
const TOP_N = 5;

export default function OutletPieChart({ data, total }: { data: ProductSale[]; total: number }) {
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Top 5 + Others
  const top = data.slice(0, TOP_N);
  const otherRevenue = data.slice(TOP_N).reduce((sum, p) => sum + p.revenue, 0);
  const rows: (ProductSale & { percentage: number })[] = [
    ...top.map((p) => ({ ...p, percentage: total ? Math.round((p.revenue / total) * 100) : 0 })),
    ...(otherRevenue > 0
      ? [{ name: t('charts.product.others'), revenue: otherRevenue, color: OTHERS_COLOR, percentage: total ? Math.round((otherRevenue / total) * 100) : 0 }]
      : []),
  ];

  return (
    <div className="flex min-h-[380px] h-full flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {t('charts.product.topProducts')}
          </div>
          <h2 className="text-lg font-semibold text-gray-900">{t('charts.product.salesByProduct')}</h2>
          <p className="text-sm text-gray-500">{t('charts.product.revenueDistribution')}</p>
        </div>
        <div className="rounded-xl bg-secondary p-2 text-primary">
          <ShoppingBag size={20} />
        </div>
      </div>

      {rows.length ? (
        <>
          {/* Donut chart with centre label */}
          <div className="relative mt-4 flex items-center justify-center" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="revenue"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={54}
                  outerRadius={80}
                  paddingAngle={2}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onMouseEnter={(_: any, index: number) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  stroke="none"
                >
                  {rows.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.color}
                      opacity={activeIndex === null || activeIndex === index ? 1 : 0.55}
                      {...(activeIndex === index ? { outerRadius: 88 } : {})}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            {/* Centre label — absolute positioned inside the donut hole */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              {activeIndex !== null ? (
                <>
                  <span
                    className="mb-0.5 max-w-[90px] truncate text-[11px] font-semibold leading-tight"
                    style={{ color: rows[activeIndex]?.color }}
                  >
                    {rows[activeIndex]?.name}
                  </span>
                  <span className="text-sm font-bold text-gray-900 leading-tight">
                    {formatNumber(rows[activeIndex]?.percentage ?? 0, locale)}%
                  </span>
                  <span className="mt-0.5 text-[10px] text-gray-400">
                    {formatMYR(rows[activeIndex]?.revenue ?? 0, locale)}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {formatNumber(data.length, locale)} {data.length === 1 ? t('charts.product.product') : t('charts.product.products')}
                  </span>
                  <span className="mt-0.5 text-sm font-bold text-gray-900 leading-tight">
                    {formatMYR(total, locale)}
                  </span>
                  <span className="mt-0.5 text-[10px] text-gray-400">{t('charts.product.total')}</span>
                </>
              )}
            </div>
          </div>


          {/* Legend list */}
          <div className="mt-4 flex flex-col gap-2" aria-label={t('charts.product.salesRevenueByProduct')}>
            {rows.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50 cursor-default"
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700">
                  {item.name}
                </span>
                <span className="shrink-0 text-xs text-gray-500">{formatNumber(item.percentage, locale)}%</span>
                <span className="shrink-0 text-xs font-semibold text-gray-900">
                  {formatMYR(item.revenue, locale, { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          {t('charts.product.noPaidSales')}
        </div>
      )}

      {/* Footer total */}
      <div className="mt-4 border-t border-gray-100 pt-4">
        <p className="text-xs text-gray-500">{t('charts.product.totalPaidRevenue')}</p>
        <p className="mt-1 text-2xl font-bold text-gray-950">
          {formatMYR(total, locale, { minimumFractionDigits: 2 })}
        </p>
        {data.length > TOP_N && (
          <p className="mt-1 text-xs text-gray-400">{t('charts.product.topProductsGrouped', { count: TOP_N })}</p>
        )}
      </div>
    </div>
  );
}
