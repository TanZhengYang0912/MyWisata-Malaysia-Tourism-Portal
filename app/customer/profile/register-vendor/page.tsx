import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import RegisterVendorForm from '@/components/vendor/register-vendor-form';
import { getVendorOnboardingStatus } from '@/lib/vendor/onboarding-status';

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
      <div className="mx-auto mt-8 mb-12 max-w-xl px-4">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <Link href="/customer/profile" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <span>←</span> Back to Profile
          </Link>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Vendor application</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground">{vendor.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{status.description}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">{status.label}</span>
            {vendor.status === 'approved' && <Link href="/vendor/dashboard" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Open vendor dashboard</Link>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto mt-8 mb-12">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 md:p-8">
        <div className="mb-8">
          <Link href="/customer/profile" className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-2 mb-6">
            <span>←</span> Back to Profile
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">🏪</span>
            <h1 className="text-2xl font-bold text-gray-900">Become a Vendor</h1>
          </div>
          <p className="text-gray-500">
            Apply to list your tours, food, stays, or local experiences. Admin approval is required before anything is visible to travellers.
          </p>
        </div>

        <div className="mb-5 grid gap-3 rounded-xl border border-primary/10 bg-primary/[0.04] p-4 text-sm text-gray-600 sm:grid-cols-3">
          <div><p className="font-semibold text-gray-900">1. Apply</p><p className="mt-1 text-xs">Tell us about your business.</p></div>
          <div><p className="font-semibold text-gray-900">2. Admin review</p><p className="mt-1 text-xs">We verify the application.</p></div>
          <div><p className="font-semibold text-gray-900">3. Go live</p><p className="mt-1 text-xs">Set up outlets and listings after approval.</p></div>
        </div>
        
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
          <RegisterVendorForm />
        </div>
      </div>
    </div>
  );
}
