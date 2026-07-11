import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RegisterVendorForm from '@/components/vendor/register-vendor-form';

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
    redirect('/profile'); // Already a vendor, go back to profile
  }

  return (
    <div className="max-w-xl mx-auto mt-8 mb-12">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 md:p-8">
        <div className="mb-8">
          <a href="/profile" className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-2 mb-6">
            <span>←</span> Back to Profile
          </a>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">🏪</span>
            <h1 className="text-2xl font-bold text-gray-900">Become a Vendor</h1>
          </div>
          <p className="text-gray-500">
            Join Malaysia Tourism Portal to start selling your tours, food, or accommodations to millions of travelers.
          </p>
        </div>
        
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-100">
          <RegisterVendorForm />
        </div>
      </div>
    </div>
  );
}
