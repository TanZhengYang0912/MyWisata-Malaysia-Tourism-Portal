import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emitVendorNotification } from '@/lib/vendor-notifications/emit';

const emailMocks = vi.hoisted(() => ({
  enqueueVendorEmail: vi.fn(async () => undefined),
}));
const serviceMocks = vi.hoisted(() => ({
  db: null as SupabaseClient | null,
}));

vi.mock('@/lib/vendor-notifications/email', () => emailMocks);
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => serviceMocks.db),
}));

type Row = Record<string, unknown>;

function makeFakeDb() {
  const rows: Record<string, Row[]> = {
    vendors: [{ id: 'vendor-1', owner_id: 'owner-1', status: 'approved' }],
    outlets: [{ id: 'outlet-1', vendor_id: 'vendor-1' }],
    outlet_managers: [{ outlet_id: 'outlet-1', user_id: 'manager-1' }],
    notifications: [],
  };
  const insertCalls: Array<{ row: Row; options: unknown }> = [];

  const db = {
    from(table: string) {
      let filters: Array<[string, unknown]> = [];
      let inserted: Row | null = null;
      let options: unknown;
      let operation: 'select' | 'insert' = 'select';
      const query: any = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters = [...filters, [column, value]];
          return query;
        },
        insert(row: Row, insertOptions: unknown) {
          operation = 'insert';
          inserted = row;
          options = insertOptions;
          insertCalls.push({ row, options: insertOptions });
          return query;
        },
        maybeSingle() {
          const result = execute();
          return Promise.resolve({
            ...result,
            data: Array.isArray(result.data) ? result.data[0] ?? null : result.data,
          });
        },
        then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
          return Promise.resolve(execute()).then(onFulfilled, onRejected);
        },
      };

      function execute() {
        if (operation === 'insert') {
          const eventKey = inserted?.event_key;
          const existing = rows.notifications.find((row) => row.event_key === eventKey);
          if (existing) return { data: null, error: null };
          const row = { ...(inserted ?? {}), id: `notification-${rows.notifications.length + 1}` };
          rows.notifications.push(row);
          return { data: { id: row.id }, error: null };
        }
        const matching = (rows[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
        return { data: matching, error: null };
      }

      return query;
    },
  };

  return { db: db as unknown as SupabaseClient, rows, insertCalls };
}

const input = {
  eventKey: 'order:order-1',
  vendorId: 'vendor-1',
  outletId: 'outlet-1',
  audience: 'owner_and_assigned_outlet' as const,
  category: 'vendor_orders' as const,
  type: 'vendor_order_update',
  title: 'New order',
  body: 'An order needs attention.',
  link: '/vendor/orders/order-1',
  email: true,
  reference: 'order-1',
  metadata: { amount: 42, source: 'checkout', nullable: null },
};

describe('emitVendorNotification', () => {
  beforeEach(() => {
    emailMocks.enqueueVendorEmail.mockClear();
  });

  it('inserts one scoped row and enqueues one email per recipient', async () => {
    const fake = makeFakeDb();
    serviceMocks.db = fake.db;

    const result = await emitVendorNotification({ ...input, serviceDb: fake.db });

    expect(result.recipientIds).toEqual(['owner-1', 'manager-1']);
    expect(result.notificationIds).toEqual(['notification-1', 'notification-2']);
    expect(fake.rows.notifications).toHaveLength(2);
    expect(fake.insertCalls.map(({ options }) => options)).toEqual([
      { onConflict: 'event_key', ignoreDuplicates: true },
      { onConflict: 'event_key', ignoreDuplicates: true },
    ]);
    expect(emailMocks.enqueueVendorEmail).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate rows or email outbox events for a repeated event', async () => {
    const fake = makeFakeDb();
    serviceMocks.db = fake.db;

    await emitVendorNotification({ ...input, serviceDb: fake.db });
    const second = await emitVendorNotification({ ...input, serviceDb: fake.db });

    expect(fake.rows.notifications).toHaveLength(2);
    expect(second.notificationIds).toEqual([]);
    expect(emailMocks.enqueueVendorEmail).toHaveBeenCalledTimes(2);
  });
});
