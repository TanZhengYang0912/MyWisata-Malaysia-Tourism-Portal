import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { readAdminOrderDetail } from '../order-operations';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function makeClient() {
  const records: Record<string, unknown[]> = {
    orders: [{
      id: ORDER_ID, display_id: 'ORD-1', user_id: null, status: 'paid', subtotal: 270,
      discount_amount: 0, total_amount: 270, currency: 'MYR', payment_method: 'card',
      voucher_code: null, paid_at: null, completed_at: null, cancelled_at: null,
      created_at: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z',
      guest_subject_id: 'must-not-leak', contact_email: 'private@example.test',
    }],
    order_items: Array.from({ length: 27 }, (_, index) => ({
      id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      fulfil_status: 'fulfilled', fulfilled_at: new Date(Date.UTC(2026, 0, 27 - index)).toISOString(),
      private_note: 'must-not-leak',
    })),
    payments: [], payment_events: [], refunds: [], bookings: [], check_in_events: [],
  };
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const client = {
    from(table: string) {
      const result = { data: records[table] ?? [], error: null };
      const proxy = new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
        get(_target, method: string | symbol) {
          if (method === 'then') return (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
          if (method === 'maybeSingle') return () => Promise.resolve({ ...result, data: records[table]?.[0] ?? null });
          return (...args: unknown[]) => {
            calls.push({ table, method: String(method), args });
            return proxy;
          };
        },
      });
      return proxy;
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('readAdminOrderDetail timeline', () => {
  it('uses bounded source reads and a stable keyset cursor without leaking raw rows', async () => {
    const { client, calls } = makeClient();
    const first = await readAdminOrderDetail(client, ORDER_ID, 'timeline', null);
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;
    const firstEvents = first.data.events as Array<{ eventKey: string }>;
    expect(firstEvents).toHaveLength(25);
    expect(first.data.hasMore).toBe(true);
    expect(JSON.stringify(first.data)).not.toContain('must-not-leak');
    expect(JSON.stringify(first.data)).not.toContain('private@example.test');
    expect(calls.filter((call) => call.method === 'limit').every((call) => call.args[0] === 26)).toBe(true);

    const cursor = first.data.nextCursor as string;
    calls.length = 0;
    const second = await readAdminOrderDetail(client, ORDER_ID, 'timeline', cursor);
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') return;
    const secondEvents = second.data.events as Array<{ eventKey: string }>;
    expect(secondEvents.length).toBeGreaterThan(0);
    expect(secondEvents.some((event) => firstEvents.some((firstEvent) => firstEvent.eventKey === event.eventKey))).toBe(false);
    expect(calls.some((call) => call.method === 'or' || call.method === 'lt')).toBe(true);
  });
});
