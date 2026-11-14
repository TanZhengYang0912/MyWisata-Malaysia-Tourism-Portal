import { getServerTranslation } from '@/lib/i18n/server';
import { getVendorAnalyticsData, type AnalyticsFilter } from '@/lib/vendor/analytics';
import { VendorAnalyticsWorkspace } from '@/components/vendor/vendor-analytics-workspace';
import DashboardRealtime from '@/components/vendor/dashboard-realtime';

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
  if (!data) return <div className="rounded-2xl bg-white dark:bg-card p-10 text-center text-gray-500 dark:text-muted-foreground">{t('ui.analytics.noVendor')}</div>;

  // Same refresh strategy as the Dashboard: vendor-scoped Realtime events plus
  // a visible-tab fallback re-render, so both pages update from one data source.
  return (
    <>
      {data.vendorId && <DashboardRealtime vendorId={data.vendorId} />}
      <VendorAnalyticsWorkspace data={data} generatedAt={new Date().toISOString()} />
    </>
  );
}
