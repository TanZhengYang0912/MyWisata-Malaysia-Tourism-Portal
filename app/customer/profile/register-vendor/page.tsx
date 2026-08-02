import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Store } from 'lucide-react';
import RegisterVendorForm from '@/components/vendor/register-vendor-form';
import { getVendorOnboardingStatus } from '@/lib/vendor/onboarding-status';
import { CustomerPageHeader, CustomerPageShell, CustomerPanel } from '@/components/customer/customer-page-shell';

export default async function RegisterVendorPage() {
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
      <CustomerPageShell>
        <CustomerPanel className="p-6 md:p-8">
          <Link href="/customer/profile" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <span>←</span> Back to Profile
          </Link>
          <CustomerPageHeader eyebrow="Vendor application" title={vendor.name} description={status.description} icon={<Store size={14} />} className="mb-6" />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">{status.label}</span>
            {vendor.status === 'approved' && <Link href="/vendor/dashboard" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Open vendor dashboard</Link>}
          </div>
        </CustomerPanel>
      </CustomerPageShell>
    );
  }

  return (
    <CustomerPageShell>
      <Link href="/customer/profile" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <span>←</span> Back to Profile
      </Link>
      <CustomerPageHeader
        eyebrow="Vendor application"
        title="Become a Vendor"
        description="Apply to list your tours, food, stays, or local experiences. Admin approval is required before anything is visible to travellers."
        icon={<Store size={14} />}
        className="mb-6"
      />

      <div className="mb-6 grid gap-3 rounded-2xl border border-primary/10 bg-primary/[0.04] p-5 text-sm text-muted-foreground sm:grid-cols-3">
        <div><p className="font-semibold text-foreground">1. Apply</p><p className="mt-1 text-xs leading-5">Tell us about your business.</p></div>
        <div><p className="font-semibold text-foreground">2. Admin review</p><p className="mt-1 text-xs leading-5">We verify the application.</p></div>
        <div><p className="font-semibold text-foreground">3. Go live</p><p className="mt-1 text-xs leading-5">Set up outlets and listings after approval.</p></div>
      </div>

      <CustomerPanel>
        <RegisterVendorForm />
      </CustomerPanel>
    </CustomerPageShell>
  );
}
