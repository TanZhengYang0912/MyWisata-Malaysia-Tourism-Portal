/// <reference types="vite/client" />
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), service: vi.fn(), serviceFrom: vi.fn(), storage: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.service }));
const routes = import.meta.glob('../**/route.ts');
const id = '11111111-1111-4111-8111-111111111111';
const forbiddenBusinessAccess = new Error('private chat business access');
let customerId: string;
let superAdmin: boolean;
let ownsOutlet: boolean;
let managesOutlet: boolean;

function query(data: unknown) {
  const promise = Promise.resolve({ data, error: null });
  const builder = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), neq: vi.fn(), maybeSingle: vi.fn(), then: promise.then.bind(promise) };
  for (const method of ['select', 'eq', 'in', 'neq'] as const) builder[method].mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue({ data: Array.isArray(data) ? data[0] ?? null : data, error: null });
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  customerId = 'someone-else'; superAdmin = false; ownsOutlet = false; managesOutlet = false;
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'actor' } }, error: null });
  mocks.rpc.mockResolvedValue({ data: 0, error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'user_roles') return query([{ roles: { name: superAdmin ? 'super_admin' : 'approver' } }]);
    // Emulate legacy RLS returning an unrelated thread to Wallet Approver.
    if (table === 'chat_threads') return query([{ id, customer_id: customerId, outlet_id: 'outlet' }]);
    if (table === 'outlets') return query(ownsOutlet ? [{ id: 'outlet' }] : []);
    if (table === 'outlet_managers') return query(managesOutlet ? [{ outlet_id: 'outlet' }] : []);
    throw forbiddenBusinessAccess;
  });
  mocks.service.mockImplementation(() => { throw forbiddenBusinessAccess; });
});

async function call(path: string, method: string, body: Record<string, unknown> = {}) {
  const route = await routes[`../${path}/route.ts`]() as Record<string, (request: Request, context: { params: Promise<{ threadId: string; id: string }> }) => Promise<Response>>;
  try {
    return await route[method](new Request(`http://localhost/api/chat/${path}?path=${id}/a.pdf`, {
      method, ...(method !== 'GET' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
    }), { params: Promise.resolve({ id, threadId: id }) });
  } catch (error) {
    if (error === forbiddenBusinessAccess) return error;
    throw error;
  }
}

describe('chat API explicit participant boundary', () => {
  it.each([
    ['[threadId]/read', 'POST', {}], ['[threadId]/delivered', 'POST', {}],
    ['[threadId]/report', 'POST', { reason: 'spam' }],
    ['[threadId]/attachments', 'GET', {}], ['[threadId]/attachments', 'POST', {}],
    ['threads/[id]/mute', 'POST', {}],
  ] as [string, string, Record<string, unknown>][])('rejects approver at %s %s even when legacy RLS returns the thread', async (path, method, body) => {
    expect(await call(path, method, body)).toMatchObject({ status: 403 });
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it('does not translate or return a cached translation of an unrelated message', async () => {
    mocks.service.mockReturnValue({ from: mocks.serviceFrom });
    mocks.serviceFrom.mockImplementation((table: string) => {
      if (table === 'chat_messages') return query({ id, thread_id: id, body: 'Private message' });
      throw forbiddenBusinessAccess;
    });
    expect(await call('translate', 'POST', { messageId: id, targetLang: 'zh' })).toMatchObject({ status: 403 });
    expect(mocks.serviceFrom.mock.calls).toEqual([['chat_messages']]);
  });

  it('returns zero unread messages without querying unrelated message content', async () => {
    const response = await call('unread-count', 'GET');
    expect(response).toMatchObject({ status: 200 });
    expect(await (response as Response).json()).toMatchObject({ data: { count: 0 } });
    expect(mocks.rpc).toHaveBeenCalledWith('get_chat_unread_count');
    expect(mocks.from.mock.calls.map(([table]) => table)).not.toContain('chat_messages');
  });

  it.each(['customer', 'vendor_owner', 'outlet_manager', 'super_admin'])('preserves actual %s access', async (kind) => {
    customerId = kind === 'customer' ? 'actor' : 'someone-else';
    ownsOutlet = kind === 'vendor_owner'; managesOutlet = kind === 'outlet_manager'; superAdmin = kind === 'super_admin';
    expect(await call('[threadId]/read', 'POST')).toBe(forbiddenBusinessAccess);
  });
});
