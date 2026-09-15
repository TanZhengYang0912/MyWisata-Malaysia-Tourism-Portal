import { getServerTranslation } from '@/lib/i18n/server';

export default async function VendorLoading() {
  const { t } = await getServerTranslation('vendor');

  return (
    <div
      className="flex min-h-[50vh] items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label={t('builder.loading')}
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
        aria-hidden="true"
      />
    </div>
  );
}
