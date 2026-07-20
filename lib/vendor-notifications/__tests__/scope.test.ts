import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveVendorRecipients } from '@/lib/vendor-notifications/scope';

type Row = Record<string, unknown>;

function makeFakeDb(seed: Record<string, Row[]>): SupabaseClient {
  const db = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const query: any = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return query;
        },
        maybeSingle() {
          const rows = (seed[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          const rows = (seed[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
          return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
        },
      };
      return query;
    },
  };

  return db as unknown as SupabaseClient;
}

const fakeDb = makeFakeDb({
  vendors: [
    { id: 'vendor-1', owner_id: 'owner-1', status: 'approved' },
    { id: 'vendor-2', owner_id: 'owner-2', status: 'approved' },
  ],
  outlets: [
    { id: 'outlet-1', vendor_id: 'vendor-1' },
    { id: 'outlet-2', vendor_id: 'vendor-1' },
    { id: 'outlet-other', vendor_id: 'vendor-2' },
  ],
  outlet_managers: [
    { outlet_id: 'outlet-1', user_id: 'manager-1' },
    { outlet_id: 'outlet-2', user_id: 'manager-2' },
    { outlet_id: 'outlet-other', user_id: 'manager-other-vendor' },
  ],
  users: [
    { id: 'owner-1' },
    { id: 'manager-1' },
    { id: 'manager-2' },
    { id: 'manager-other-vendor' },
  ],
});

describe('resolveVendorRecipients', () => {
  it('returns owner plus managers assigned to the event outlet', async () => {
    const recipients = await resolveVendorRecipients({
      vendorId: 'vendor-1',
      outletId: 'outlet-1',
      audience: 'owner_and_assigned_outlet',
      serviceDb: fakeDb,
    });

    expect(recipients).toEqual([
      { userId: 'owner-1', role: 'vendor_owner', outletId: null },
      { userId: 'manager-1', role: 'outlet_manager', outletId: 'outlet-1' },
    ]);
  });

  it('never includes a manager assigned to another outlet or vendor', async () => {
    const recipients = await resolveVendorRecipients({
      vendorId: 'vendor-1',
      outletId: 'outlet-1',
      audience: 'assigned_outlet',
      serviceDb: fakeDb,
    });

    expect(recipients.map((row) => row.userId)).toEqual(['manager-1']);
  });

  it('returns no recipients for an unapproved vendor or cross-vendor outlet', async () => {
    const unapproved = makeFakeDb({ vendors: [{ id: 'vendor-1', owner_id: 'owner-1', status: 'pending' }] });
    const crossVendor = await resolveVendorRecipients({
      vendorId: 'vendor-1',
      outletId: 'outlet-other',
      audience: 'assigned_outlet',
      serviceDb: fakeDb,
    });

    expect(await resolveVendorRecipients({ vendorId: 'vendor-1', audience: 'owner', serviceDb: unapproved })).toEqual([]);
    expect(crossVendor).toEqual([]);
  });

  it('allows only the known owner for lifecycle events on an unapproved vendor', async () => {
    const unapproved = makeFakeDb({ vendors: [{ id: 'vendor-1', owner_id: 'owner-1', status: 'suspended' }] });
    await expect(resolveVendorRecipients({
      vendorId: 'vendor-1',
      audience: 'owner',
      allowUnapprovedOwner: true,
      serviceDb: unapproved,
    })).resolves.toEqual([{ userId: 'owner-1', role: 'vendor_owner', outletId: null }]);
    await expect(resolveVendorRecipients({
      vendorId: 'vendor-1',
      audience: 'owner_and_assigned_outlet',
      allowUnapprovedOwner: true,
      serviceDb: unapproved,
    })).resolves.toEqual([]);
  });
});
