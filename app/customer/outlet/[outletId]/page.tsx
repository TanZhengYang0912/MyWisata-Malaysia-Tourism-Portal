import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function OutletRedirectPage({ params }: { params: Promise<{ outletId: string }> }) {
  const { outletId } = await params;
  const db = await createClient();
  
  // Find the vendor for this outlet
  const { data: outlet } = await db
    .from('outlets')
    .select('vendor_id')
    .eq('id', outletId)
    .eq('status', 'active')
    .eq('review_status', 'approved')
    .maybeSingle();

  if (!outlet || !outlet.vendor_id) {
    notFound();
  }

  // Redirect to the new canonical nested route
  redirect(`/customer/vendor/${outlet.vendor_id}/outlet/${outletId}`);
}
