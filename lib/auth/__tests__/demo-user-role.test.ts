import { describe, expect, it } from 'vitest';
import { pickDemoAssignment, pickDemoRole } from '@/lib/auth/demo-user-role';

describe('pickDemoRole', () => {
  it('keeps privileged and vendor roles instead of falling back to customer', () => {
    expect(pickDemoRole([{ roles: { name: 'customer' } }, { roles: { name: 'super_admin' } }])).toBe('super_admin');
    expect(pickDemoRole([{ roles: { name: 'customer' } }, { roles: { name: 'vendor_owner' } }])).toBe('vendor_owner');
    expect(pickDemoRole([{ roles: { name: 'customer' } }, { roles: { name: 'outlet_manager' } }])).toBe('outlet_manager');
    expect(pickDemoRole([{ roles: { name: 'approver' } }])).toBe('approver');
  });

  it('uses customer only when a demo account has no role assignment', () => {
    expect(pickDemoRole([])).toBe('customer');
  });

  it('returns the assignment that owns the selected role for session loading', () => {
    const customerAssignment = { id: 'customer', roles: { name: 'customer' } };
    const ownerAssignment = { id: 'owner', roles: { name: 'vendor_owner' }, vendor_id: 'vendor-1' };
    expect(pickDemoAssignment([customerAssignment, ownerAssignment])).toBe(ownerAssignment);
  });
});
