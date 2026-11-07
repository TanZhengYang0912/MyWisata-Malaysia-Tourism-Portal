import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import GuestActivityPage from '@/app/guest/activity/[id]/page';
import GuestVendorPage from '@/app/guest/vendor/[vendorId]/page';

describe('guest catalogue aliases', () => {
  it('retains purchase context when redirecting a product', async () => {
    await expect(GuestActivityPage({ params: Promise.resolve({ id: 'p' }), searchParams: Promise.resolve({ outletId: 'o', returnTo: '/customer/explore?q=茶' }) }))
      .rejects.toThrow('redirect:/customer/products/p?outletId=o&returnTo=%2Fcustomer%2Fexplore%3Fq%3D%E8%8C%B6');
  });
  it('retains attribution when redirecting a vendor', async () => {
    await expect(GuestVendorPage({ params: Promise.resolve({ vendorId: 'v' }), searchParams: Promise.resolve({ campaign: 'abc' }) }))
      .rejects.toThrow('redirect:/customer/vendors/v?campaign=abc');
  });
});
