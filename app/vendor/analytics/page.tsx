import { getServerTranslation } from '@/lib/i18n/server';
import { getVendorAnalyticsData, type AnalyticsFilter } from '@/lib/vendor/analytics';
import { VendorAnalyticsWorkspace } from '@/components/vendor/vendor-analytics-workspace';

interface Props {
  searchParams?: Promise<{ filter?: string; outlet?: string }>;
}

function normalizeFilter(value: string | undefined): AnalyticsFilter {
  return value === '7d' || value === '12m' ? value : '30d';
}

export default async function VendorAnalyticsPage({ searchParams }: Props) {
  const { t } = await getServerTranslation('vendor');
  const params = await searchParams;
  const data = await getVendorAnalyticsData(normalizeFilter(params?.filter), params?.outlet);
  if (!data) return <div className="rounded-2xl bg-white p-10 text-center text-gray-500">{t('ui.analytics.noVendor')}</div>;

  return <VendorAnalyticsWorkspace data={data} />;
}
