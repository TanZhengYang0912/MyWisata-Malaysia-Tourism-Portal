import Link from 'next/link';
import VendorClaimForm from '@/components/vendor/vendor-claim-form';
import { getServerTranslation } from '@/lib/i18n/server';

export default async function VendorRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ recommendation?: string }>;
}) {
  const { t } = await getServerTranslation('vendor');
  const { recommendation: token } = await searchParams;

  if (!token) {
    return (
      <div className="mx-auto mt-10 max-w-xl px-4">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-xl font-bold text-foreground">{t('ui.register.invitationNotFound')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('ui.register.invitationNotFoundDescription')}</p>
          <Link href="/" className="mt-5 inline-block text-sm font-semibold text-primary">{t('ui.register.returnHome')}</Link>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto mt-10 mb-12 max-w-xl px-4">
      <VendorClaimForm token={token} />
    </main>
  );
}
