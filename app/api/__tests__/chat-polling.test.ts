import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'customer-1' } as { id: string } | null,
  calls: [] as { table: string; ops: [string, ...unknown[]][] }[],
  rows: {} as Record<string, unknown>,
  rpc: vi.fn(),
  authorizeVendor: vi.fn(),
}));

/** Chainable fake PostgREST client recording every filter; resolves from mocks.rows[table]. */
function fakeClient() {
  return {
    rpc: mocks.rpc,
    from(table: string) {
      const call = { table, ops: [] as [string, ...unknown[]][] };
      mocks.calls.push(call);
      const result = () => {
        const value = mocks.rows[table];
        return typeof value === 'function' ? (value as (c: typeof call) => unknown)(call) : { data: value ?? [], error: null, count: 0 };
      };
      const builder: Record<string, unknown> = {};
      for (const op of ['select', 'eq', 'neq', 'in', 'gte', 'lt', 'order', 'limit']) builder[op] = (...args: unknown[]) => { call.ops.push([op, ...args]); return builder; };
      builder.maybeSingle = async () => result();
      builder.then = (resolve: (value: unknown) => unknown) => resolve(result());
      return builder;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ ...fakeClient(), auth: { getUser: async () => ({ data: { user: mocks.user }, error: null }) } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => fakeClient() }));
vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));
vi.mock('@/lib/chat/authorization', () => ({ accessibleChatThreadIds: async (_db: unknown, _user: string, threads: { id: string }[]) => new Set(threads.map((t) => t.id)) }));

import { GET as listCustomerChats } from '../customer/chat/route';
import { GET as getCustomerThread } from '../customer/chat/[threadId]/route';
import { GET as listVendorInbox } from '../vendors/[vendorId]/inbox/route';
import { GET as getVendorThread } from '../vendors/[vendorId]/inbox/[threadId]/route';
import { POST as markRead } from '../chat/[threadId]/read/route';

const summary = {
  id: 'thread-1', customer_id: 'customer-1', outlet_id: 'outlet-1', vendor_id: 'vendor-1', status: 'open',
  last_message_at: '2026-11-06T01:00:00Z', created_at: '2026-11-01T00:00:00Z', outlet_name: 'Ghee Hiang — Jalan Macalister',
  outlet_city: 'George Town', outlet_state: 'Penang', customer_full_name: 'Nur Aisyah', customer_email: 'nur@example.com',
  latest_message: { id: 'm-9', sender_id: 'vendor-staff', body: 'See you', created_at: '2026-11-06T01:00:00Z' }, unread_count: 2, muted: true,
};

beforeEach(() => {
  mocks.user = { id: 'customer-1' };
  mocks.calls = [];
  mocks.rows = {};
  mocks.rpc.mockReset();
  mocks.authorizeVendor.mockReset();
  mocks.authorizeVendor.mockResolvedValue({ ok: true, access: { userId: 'staff-1', outletIds: ['outlet-1'], serviceDb: fakeClient() } });
});

describe('customer chat list', () => {
  it('returns one summary per thread from the service-role RPC for the signed-in customer', async () => {
    mocks.rpc.mockResolvedValue({ data: [summary], error: null });
    const body = await (await listCustomerChats()).json();
    expect(mocks.rpc).toHaveBeenCalledWith('get_chat_thread_summaries', { p_user_id: 'customer-1' });
    expect(body.data.threads[0]).toMatchObject({ id: 'thread-1', latest_message: { body: 'See you' }, unread_count: 2, muted: true, outlets: { name: summary.outlet_name } });
    expect(body.data.threads[0]).not.toHaveProperty('chat_messages');
    expect(body.data.threads[0]).not.toHaveProperty('customer');
    expect(mocks.calls).toHaveLength(0);
  });

  it('requires sign-in before any read', async () => {
    mocks.user = null;
    expect((await listCustomerChats()).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe('customer open thread', () => {
  const params = { params: Promise.resolve({ threadId: 'thread-1' }) };
  beforeEach(() => {
    mocks.rows.chat_threads = { id: 'thread-1', customer_id: 'customer-1', chat_messages: [] };
  });

  it('asks only for messages from the cursor on refresh, scoped to the customer', async () => {
    await getCustomerThread(new Request('http://x/api/customer/chat/thread-1?after=2026-11-06T01:00:00.000Z'), params);
    const thread = mocks.calls.find((c) => c.table === 'chat_threads')!;
    expect(thread.ops).toContainEqual(['eq', 'customer_id', 'customer-1']);
    expect(thread.ops).toContainEqual(['gte', 'chat_messages.created_at', '2026-11-06T01:00:00.000Z']);
  });

  it('loads the whole thread when opened, and checks receipts for the newest 100 own messages only', async () => {
    await getCustomerThread(new Request('http://x/api/customer/chat/thread-1'), params);
    expect(mocks.calls.find((c) => c.table === 'chat_threads')!.ops.some(([op]) => op === 'gte')).toBe(false);
    const own = mocks.calls.find((c) => c.table === 'chat_messages')!;
    expect(own.ops).toContainEqual(['eq', 'sender_id', 'customer-1']);
    expect(own.ops).toContainEqual(['limit', 100]);
  });
});

describe('vendor inbox', () => {
  it('lists summaries for exactly the outlets authorizeVendor allowed, with the customer name', async () => {
    mocks.rpc.mockResolvedValue({ data: [summary], error: null });
    const response = await listVendorInbox(new Request('http://x'), { params: Promise.resolve({ vendorId: 'vendor-1' }) });
    expect(mocks.rpc).toHaveBeenCalledWith('get_chat_thread_summaries', { p_user_id: 'staff-1', p_outlet_ids: ['outlet-1'] });
    expect((await response!.json()).data[0]).toMatchObject({ customer: { full_name: 'Nur Aisyah' }, outlets: { full_name: summary.outlet_name, name: 'Jalan Macalister' } });
  });

  it('pages the open thread: newest 50 first, oldest-first order, hasOlder when more exist', async () => {
    mocks.rows.chat_threads = { id: 'thread-1', outlet_id: 'outlet-1' };
    const newestFirst = Array.from({ length: 51 }, (_, i) => ({ id: `m-${51 - i}`, created_at: `2026-11-06T00:${String(51 - i).padStart(2, '0')}:00Z` }));
    mocks.rows.chat_messages = newestFirst;
    const response = await getVendorThread(new Request('http://x?before=2026-11-06T01:00:00Z'), { params: Promise.resolve({ vendorId: 'vendor-1', threadId: 'thread-1' }) });
    const { data } = await response.json();
    expect(data.hasOlder).toBe(true);
    expect(data.messages).toHaveLength(50);
    expect(data.messages[0].id).toBe('m-2');
    expect(data.messages[49].id).toBe('m-51');
    const read = mocks.calls.find((c) => c.table === 'chat_messages')!;
    expect(read.ops).toContainEqual(['lt', 'created_at', '2026-11-06T01:00:00.000Z']);
    expect(read.ops).toContainEqual(['limit', 51]);
  });

  it('refuses a thread at an outlet the user may not see', async () => {
    mocks.rows.chat_threads = { id: 'thread-x', outlet_id: 'other-outlet' };
    const response = await getVendorThread(new Request('http://x'), { params: Promise.resolve({ vendorId: 'vendor-1', threadId: 'thread-x' }) });
    expect(response.status).toBe(404);
    expect(mocks.calls.some((c) => c.table === 'chat_messages')).toBe(false);
  });
});

describe('mark as read', () => {
  it('marks the thread read in one RPC after the participant check', async () => {
    mocks.rows.chat_threads = { id: 'thread-1', customer_id: 'customer-1', outlet_id: 'outlet-1' };
    mocks.rpc.mockResolvedValue({ data: 3, error: null });
    const body = await (await markRead(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ threadId: 'thread-1' }) })).json();
    expect(mocks.rpc).toHaveBeenCalledWith('mark_chat_thread_read', { p_user_id: 'customer-1', p_thread_id: 'thread-1' });
    expect(body.data).toEqual({ threadId: 'thread-1', readCount: 3 });
    expect(mocks.calls.some((c) => c.table === 'chat_messages' || c.table === 'chat_message_reads')).toBe(false);
  });
});
