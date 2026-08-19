import { describe, expect, it } from 'vitest';
import { demoAccountRoleCategories, filterDemoAccountsByRole } from '@/lib/auth/demo-account-filter';

describe('demoAccountRoleCategories', () => {
  it('returns only roles present in the list, in a fixed priority order', () => {
    const users = [
      { role: 'customer' as const },
      { role: 'vendor_owner' as const },
      { role: 'customer' as const },
    ];
    expect(demoAccountRoleCategories(users)).toEqual(['vendor_owner', 'customer']);
  });

  it('never includes a role with zero accounts', () => {
    const users = [{ role: 'customer' as const }];
    expect(demoAccountRoleCategories(users)).toEqual(['customer']);
    expect(demoAccountRoleCategories(users)).not.toContain('approver');
    expect(demoAccountRoleCategories(users)).not.toContain('vendor_owner');
  });

  it('returns an empty list for an empty account list', () => {
    expect(demoAccountRoleCategories([])).toEqual([]);
  });

  it('orders super_admin before approver before vendor_owner before outlet_manager before customer', () => {
    const users = [
      { role: 'customer' as const },
      { role: 'outlet_manager' as const },
      { role: 'vendor_owner' as const },
      { role: 'approver' as const },
      { role: 'super_admin' as const },
    ];
    expect(demoAccountRoleCategories(users)).toEqual([
      'super_admin', 'approver', 'vendor_owner', 'outlet_manager', 'customer',
    ]);
  });
});

describe('filterDemoAccountsByRole', () => {
  const users = [
    { id: '1', role: 'customer' as const },
    { id: '2', role: 'vendor_owner' as const },
    { id: '3', role: 'vendor_owner' as const },
  ];

  it('returns every account when no category is selected', () => {
    expect(filterDemoAccountsByRole(users, null)).toEqual(users);
  });

  it('returns only accounts matching the selected category', () => {
    expect(filterDemoAccountsByRole(users, 'vendor_owner')).toEqual([users[1], users[2]]);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterDemoAccountsByRole(users, 'super_admin')).toEqual([]);
  });
});
