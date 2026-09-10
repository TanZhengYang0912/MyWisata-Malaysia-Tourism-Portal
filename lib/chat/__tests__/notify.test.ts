import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveVendorRecipients = vi.fn();
vi.mock('@/lib/vendor-notifications/scope', () => ({ resolveVendorRecipients: (...a: unknown[]) => resolveVendorRecipients(...a) }));

import { notifyNewChatMessage } from '../notify';

type Upsert = { table: string; rows: unknown; opts: unknown };

function fakeService(upserts: Upsert[], lookups: Record<string, unknown> = {}) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: lookups[table] ?? null }) };
            },
          };
        },
        upsert(rows: unknown, opts: unknown) {
          upserts.push({ table, rows, opts });
          return Promise.resolve({ error: null });
        },
      };
    },
  } as never;
}

describe('notifyNewChatMessage', () => {
  beforeEach(() => {
    resolveVendorRecipients.mockReset();
  });

  it('customer sender: one coalesced row per vendor recipient, skipping the sender', async () => {
    resolveVendorRecipients.mockResolvedValue([
      { userId: 'owner-1', role: 'vendor_owner', outletId: null },
      { userId: 'mgr-1', role: 'outlet_manager', outletId: 'outlet-1' },
      { userId: 'cust-1', role: 'outlet_manager', outletId: 'outlet-1' }, // == senderId, filtered
    ]);
    const upserts: Upsert[] = [];
    await notifyNewChatMessage(fakeService(upserts, { public_users: { display_name: 'Ada' } }), {
      threadId: 'th-1', senderId: 'cust-1', senderRole: 'customer',
      customerId: 'cust-1', vendorId: 'v-1', outletId: 'outlet-1', preview: 'hi there',
    });

    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe('notifications');
    expect(upserts[0].opts).toEqual({ onConflict: 'event_key' });
    const rows = upserts[0].rows as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.user_id)).toEqual(['owner-1', 'mgr-1']);
    expect(rows.every((r) => r.category === 'vendor_orders')).toBe(true);
    expect(rows[0].event_key).toBe('chat:th-1:owner-1');
    expect(rows[0].link).toBe('/vendor/inbox?thread=th-1');
    expect(rows[0].metadata).toMatchObject({ name: 'Ada', preview: 'hi there', thread_id: 'th-1' });
  });

  it('vendor sender: one customer row under the messages category', async () => {
    const upserts: Upsert[] = [];
    await notifyNewChatMessage(fakeService(upserts, { outlets: { name: 'Beach Hut' } }), {
      threadId: 'th-2', senderId: 'owner-9', senderRole: 'vendor',
      customerId: 'cust-2', vendorId: 'v-2', outletId: 'outlet-2', preview: null,
    });

    expect(upserts).toHaveLength(1);
    const row = upserts[0].rows as Record<string, unknown>;
    expect(row.user_id).toBe('cust-2');
    expect(row.category).toBe('messages');
    expect(row.link).toBe('/customer?chat=th-2');
    expect(row.event_key).toBe('chat:th-2:cust-2');
    expect(row.metadata).toMatchObject({ name: 'Beach Hut', attachment: true });
  });

  it('never notifies the sender back (vendor is also the customer edge)', async () => {
    const upserts: Upsert[] = [];
    await notifyNewChatMessage(fakeService(upserts), {
      threadId: 'th-3', senderId: 'cust-3', senderRole: 'vendor',
      customerId: 'cust-3', vendorId: 'v-3', outletId: null, preview: 'x',
    });
    expect(upserts).toHaveLength(0);
  });

  it('customer sender with no vendor id is a no-op', async () => {
    const upserts: Upsert[] = [];
    await notifyNewChatMessage(fakeService(upserts), {
      threadId: 'th-4', senderId: 'cust-4', senderRole: 'customer',
      customerId: 'cust-4', vendorId: null, outletId: null, preview: 'x',
    });
    expect(upserts).toHaveLength(0);
    expect(resolveVendorRecipients).not.toHaveBeenCalled();
  });

  it('swallows errors so a send never fails on a notification fault', async () => {
    resolveVendorRecipients.mockRejectedValue(new Error('boom'));
    await expect(notifyNewChatMessage(fakeService([]), {
      threadId: 'th-5', senderId: 'c', senderRole: 'customer',
      customerId: 'c', vendorId: 'v', outletId: null, preview: 'x',
    })).resolves.toBeUndefined();
  });
});
