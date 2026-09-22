import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/vendor/profile',
  replace: vi.fn(),
  auth: {
    loading: false,
    user: { roles: ['customer'] },
    isVendor: false,
    isVendorOwner: false,
    isOutletManager: false,
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => mocks.auth,
}));

import VendorAccessGate from '@/components/layout/vendor-access-gate';

describe('VendorAccessGate', () => {
  beforeEach(() => {
    mocks.pathname = '/vendor/profile';
    mocks.replace.mockReset();
    mocks.auth = {
      loading: false,
      user: { roles: ['customer'] },
      isVendor: false,
      isVendorOwner: false,
      isOutletManager: false,
    };
  });

  it('does not render vendor pages for a customer', () => {
    const markup = renderToStaticMarkup(
      <VendorAccessGate><p>Private vendor profile</p></VendorAccessGate>,
    );

    expect(markup).toBe('');
  });

  it('allows vendor owners into the profile page', () => {
    mocks.auth = {
      loading: false,
      user: { roles: ['vendor_owner'] },
      isVendor: true,
      isVendorOwner: true,
      isOutletManager: false,
    };

    const markup = renderToStaticMarkup(
      <VendorAccessGate><p>Private vendor profile</p></VendorAccessGate>,
    );

    expect(markup).toContain('Private vendor profile');
  });

  it('keeps outlet managers within their operational routes', () => {
    mocks.auth = {
      loading: false,
      user: { roles: ['outlet_manager'] },
      isVendor: true,
      isVendorOwner: false,
      isOutletManager: true,
    };

    expect(renderToStaticMarkup(
      <VendorAccessGate><p>Private vendor profile</p></VendorAccessGate>,
    )).toBe('');

    mocks.pathname = '/vendor/orders';
    expect(renderToStaticMarkup(
      <VendorAccessGate><p>Outlet orders</p></VendorAccessGate>,
    )).toContain('Outlet orders');
  });
});
