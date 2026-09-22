import { createClient } from '@/lib/supabase/server';
import { getServerTranslation } from '@/lib/i18n/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Store } from 'lucide-react';
import RegisterVendorForm from '@/components/vendor/register-vendor-form';
import { getVendorOnboardingStatus } from '@/lib/vendor/onboarding-status';
import { CustomerPageShell, CustomerPageTitle, CustomerPanel } from '@/components/customer/customer-page-shell';

export default async function RegisterVendorPage() {
  const { t } = await getServerTranslation('customer');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if they already have a vendor account
  const { data: vendor } = await supabase
    .from('vendors')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (vendor) {
    const status = getVendorOnboardingStatus(vendor.status);
    return (
      <>
        <CustomerPageTitle
          eyebrow={t('ui.profile.vendorApplication')}
          title={vendor.name}
          description={t(`ui.profile.vendorStatus.${vendor.status}`)}
          icon={<Store size={14} />}
        />
        <CustomerPageShell wide className="pt-0 sm:pt-0">
          <Link href="/customer/profile" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <span aria-hidden="true">←</span> {t('ui.profile.backToProfile')}
          </Link>
          <CustomerPanel className="p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                {t(`ui.profile.vendorStatusLabel.${vendor.status}`)}
              </span>
              {vendor.status === 'approved' && <Link href="/vendor/dashboard" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">{t('ui.profile.openVendorDashboard')}</Link>}
            </div>
          </CustomerPanel>
        </CustomerPageShell>
      </>
    );
  }

  return (
    <>
      <CustomerPageTitle
        eyebrow={t('ui.profile.vendorApplication')}
        title={t('accountItems.becomeVendor.label')}
        description={t('ui.profile.vendorApplicationDescription')}
        icon={<Store size={14} />}
        className="mb-6"
      />

      <CustomerPageShell wide className="pt-0 sm:pt-0">
        <Link
          href="/customer/profile"
          className="mb-5 inline-flex min-h-9 items-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span aria-hidden="true">←</span> {t('ui.profile.backToProfile')}
        </Link>

        <ol className="mb-6 grid gap-3 sm:grid-cols-3">
          <li aria-current="step" className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 shadow-sm shadow-primary/5 sm:p-5">
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-accent" />
            <p className="font-semibold text-foreground">{t('ui.profile.vendorStepApply')}</p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t('ui.profile.vendorStepApplyHint')}</p>
          </li>
          <li className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
            <p className="font-semibold text-foreground">{t('ui.profile.vendorStepReview')}</p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t('ui.profile.vendorStepReviewHint')}</p>
          </li>
          <li className="rounded-2xl border border-border bg-card/70 p-4 sm:p-5">
            <p className="font-semibold text-foreground">{t('ui.profile.vendorStepLive')}</p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t('ui.profile.vendorStepLiveHint')}</p>
          </li>
        </ol>

        <CustomerPanel className="p-5 sm:p-7">
          <RegisterVendorForm />
        </CustomerPanel>
      </CustomerPageShell>
    </>
  );
}
