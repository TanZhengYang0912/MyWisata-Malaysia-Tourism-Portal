import { permanentRedirect } from 'next/navigation';
import { getOutletShopHref } from '@/lib/customer/shop-navigation';

// Compatibility entry; next.config.ts normally redirects this path first.
export default async function OutletRedirectPage({ params }: { params: Promise<{ outletId: string }> }) {
  const { outletId } = await params;
  permanentRedirect(getOutletShopHref(outletId));
}
