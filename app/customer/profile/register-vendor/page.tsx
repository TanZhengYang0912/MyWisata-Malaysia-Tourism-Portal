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
          eyebrow={t('ui.profile.vendorApplication', { defaultValue: 'Vendor application' })}
          title={vendor.name}
          description={t(`ui.profile.vendorStatus.${vendor.status}`, { defaultValue: status.description })}
          icon={<Store size={14} />}
        />
        <CustomerPageShell className="pt-0 sm:pt-0">
          <Link href="/customer/profile" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <span aria-hidden="true">←</span> {t('ui.profile.backToProfile', { defaultValue: 'Back to Profile' })}
          </Link>
          <CustomerPanel className="p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                {t(`ui.profile.vendorStatusLabel.${vendor.status}`, { defaultValue: status.label })}
              </span>
              {vendor.status === 'approved' && <Link href="/vendor/dashboard" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">{t('ui.profile.openVendorDashboard', { defaultValue: 'Open vendor dashboard' })}</Link>}
            </div>
          </CustomerPanel>
        </CustomerPageShell>
      </>
    );
  }

  return (
    <>
      <CustomerPageTitle
        eyebrow={t('ui.profile.vendorApplication', { defaultValue: 'Vendor application' })}
        title={t('accountItems.becomeVendor.label')}
        description={t('ui.profile.vendorApplicationDescription', { defaultValue: 'Apply to list your tours, food, stays, or local experiences. Admin approval is required before anything is visible to travellers.' })}
        icon={<Store size={14} />}
        className="mb-6"
      />

      <CustomerPageShell className="pt-0 sm:pt-0">
        <Link href="/customer/profile" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <span aria-hidden="true">←</span> {t('ui.profile.backToProfile', { defaultValue: 'Back to Profile' })}
        </Link>

        <div className="mb-6 grid gap-3 rounded-2xl border border-primary/10 bg-primary/[0.04] p-5 text-sm text-muted-foreground sm:grid-cols-3 sm:p-6">
          <div><p className="font-semibold text-foreground">{t('ui.profile.vendorStepApply', { defaultValue: '1. Apply' })}</p><p className="mt-1 text-xs leading-5">{t('ui.profile.vendorStepApplyHint', { defaultValue: 'Tell us about your business.' })}</p></div>
          <div><p className="font-semibold text-foreground">{t('ui.profile.vendorStepReview', { defaultValue: '2. Admin review' })}</p><p className="mt-1 text-xs leading-5">{t('ui.profile.vendorStepReviewHint', { defaultValue: 'We verify the application.' })}</p></div>
          <div><p className="font-semibold text-foreground">{t('ui.profile.vendorStepLive', { defaultValue: '3. Go live' })}</p><p className="mt-1 text-xs leading-5">{t('ui.profile.vendorStepLiveHint', { defaultValue: 'Set up outlets and listings after approval.' })}</p></div>
        </div>

        <CustomerPanel>
          <RegisterVendorForm />
        </CustomerPanel>
      </CustomerPageShell>
    </>
  );
}
