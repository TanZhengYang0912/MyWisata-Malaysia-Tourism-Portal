import { describe, expect, it } from 'vitest';
import nextConfig from '../../../next.config';
import { buildProductPath, getVendorHref } from '@/lib/customer/navigation-context';
import { getOutletShopHref } from '@/lib/customer/shop-navigation';
import { isPublicCustomerPath } from '@/lib/auth/public-customer-paths';

describe('canonical catalogue routes', () => {
  it('keeps catalogue paths public while account activity remains protected', () => {
    for (const path of ['/customer/vendors', getVendorHref('v'), getOutletShopHref('o'), buildProductPath('p')]) {
      expect(isPublicCustomerPath(path)).toBe(true);
    }
    expect(isPublicCustomerPath('/customer/activity')).toBe(false);
  });

  it('maps legacy catalogue routes without redirecting account history or nested outlet associations', async () => {
    const redirects = await nextConfig.redirects!();
    const catalogue = redirects.filter((rule) => rule.source.startsWith('/customer/'));
    expect(catalogue).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: '/customer/activity/:id', destination: '/customer/products/:id', permanent: true }),
      expect.objectContaining({ source: '/customer/vendor/:vendorId', destination: '/customer/vendors/:vendorId', permanent: true }),
      expect.objectContaining({ source: '/customer/outlet/:outletId', destination: '/customer/outlets/:outletId', permanent: true }),
      expect.objectContaining({ source: '/customer/experience/:id', destination: '/customer/products/:id', permanent: true }),
    ]));
    expect(catalogue.some((rule) => rule.source === '/customer/activity')).toBe(false);
    expect(catalogue.some((rule) => rule.source.includes('/outlet/:outletId') && rule.source.includes('/vendor/'))).toBe(false);
  });
});
