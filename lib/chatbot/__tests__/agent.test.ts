import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  callGeminiAgent: vi.fn(),
  activities: [] as unknown[],
}));

vi.mock('@/lib/admin-ai/gemini', () => ({ callGeminiAgent: mocks.callGeminiAgent }));
vi.mock('@/lib/cache/catalogue-cache', () => ({ getCachedComputedActivities: async () => mocks.activities }));
vi.mock('@/backend/domains/catalogue', () => ({ filterComputedActivities: (_filters: unknown, list: unknown[]) => list }));
vi.mock('../retrieve', () => ({ retrieve: vi.fn(async () => []) }));

import { runCustomerAgent } from '../agent';

const ORDER = '5f2c1a7e-2026-4123-8123-0123456789ab';

/** Script the model: each entry is one turn's tool calls, then a final text. */
function scriptModel(turns: { name: string; args?: Record<string, unknown> }[][], finalText: string) {
  let index = 0;
  mocks.callGeminiAgent.mockImplementation(async () => {
    const calls = turns[index] ?? [];
    index += 1;
    return { content: { role: 'model', parts: [] }, text: calls.length ? '' : finalText, calls };
  });
}

/** What the model was sent back for the given tool. */
function toolResponse(name: string) {
  for (const [, contents] of mocks.callGeminiAgent.mock.calls) {
    for (const content of contents as { parts: { functionResponse?: { name: string; response: unknown } }[] }[]) {
      const part = content.parts.find((p) => p.functionResponse?.name === name);
      if (part) return part.functionResponse!.response as Record<string, unknown>;
    }
  }
  return null;
}

/** Fake cookie client: records filters; `orders` returns `order` for single reads and `[order]` for lists. */
function userDb(order: Record<string, unknown> | null) {
  const filters: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit', 'in']) chain[m] = () => chain;
  chain.eq = (...args: unknown[]) => { filters.push(args); return chain; };
  chain.maybeSingle = async () => ({ data: order, error: null });
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: order ? [order] : [], error: null });
  return { db: { from: () => chain } as never, filters };
}

function service(refundStatus: string | null) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'order', 'eq']) chain[m] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: refundStatus ? [{ order_id: ORDER, status: refundStatus }] : [], error: null });
  return { from: () => chain } as never;
}

const activity = {
  id: 'p1', name: 'Musang King Durian', category: 'Food', description: 'Call 012-3456789', price: 45, rating: 4.6, reviews: 12,
  outlet: { id: 'o1', name: 'Durian Corner', city: 'George Town', state: 'Penang', hours: '10am-10pm' },
};
const paidOrder = { id: ORDER, display_id: 'MW-1001', status: 'paid', total_amount: 90, created_at: '2026-11-01T00:00:00Z', order_items: [{ product_name: 'Musang King Durian', quantity: 2 }] };

describe('customer chatbot agent', () => {
  beforeEach(() => {
    mocks.callGeminiAgent.mockReset();
    mocks.activities = [activity];
  });

  it('shows found listings as links without sending descriptions or links to the model', async () => {
    scriptModel([[{ name: 'find_listings', args: { text: 'durian' } }]], 'Durian Corner in George Town has it.');
    const result = await runCustomerAgent(service(null), 'where can I find durian?', { userDb: null, userId: null, history: [] });

    expect(result.answer).toBe('Durian Corner in George Town has it.');
    expect(result.listings).toMatchObject([{ id: 'p1', shop: 'Durian Corner', href: '/customer/products/p1?outletId=o1' }]);
    const sent = JSON.stringify(toolResponse('find_listings'));
    expect(sent).toContain('Musang King Durian');
    expect(sent).not.toContain('012-3456789');
    expect(sent).not.toContain('/customer/');
  });

  it('keeps orders and refunds behind sign-in', async () => {
    scriptModel([[{ name: 'my_orders' }, { name: 'propose_refund', args: { order_id: ORDER, reason_code: 'mistake', reason: 'Ordered twice' } }]], 'Please sign in.');
    const result = await runCustomerAgent(service(null), 'refund my order', { userDb: null, userId: null, history: [] });

    expect(toolResponse('my_orders')).toEqual({ error: 'sign_in_required' });
    expect(toolResponse('propose_refund')).toEqual({ error: 'sign_in_required' });
    expect(result.refunds).toEqual([]);
  });

  it('prepares a refund card for the caller\'s own paid order, filtered by their user id', async () => {
    const { db, filters } = userDb(paidOrder);
    scriptModel([[{ name: 'propose_refund', args: { order_id: ORDER, reason_code: 'mistake', reason: 'Ordered twice' } }]], 'Press Confirm to send it.');
    const result = await runCustomerAgent(service(null), 'refund my durian order, I ordered twice', { userDb: db, userId: 'u1', history: [] });

    expect(filters).toEqual(expect.arrayContaining([['id', ORDER], ['user_id', 'u1']]));
    expect(result.refunds).toMatchObject([{
      orderRef: 'MW-1001', items: '2 x Musang King Durian', total: 90,
      request: { method: 'POST', url: `/api/orders/${ORDER}/refund`, body: { reason: 'Ordered twice', reasonCode: 'mistake' } },
    }]);
  });

  it('refuses a refund card for an order already being refunded or not paid', async () => {
    scriptModel([[{ name: 'propose_refund', args: { order_id: ORDER, reason_code: 'mistake', reason: 'Ordered twice' } }]], 'It is already being refunded.');
    const pending = await runCustomerAgent(service('pending'), 'refund it', { userDb: userDb(paidOrder).db, userId: 'u1', history: [] });
    expect(pending.refunds).toEqual([]);
    expect(toolResponse('propose_refund')).toEqual({ error: 'refund already pending' });

    mocks.callGeminiAgent.mockReset();
    scriptModel([[{ name: 'propose_refund', args: { order_id: ORDER, reason_code: 'mistake', reason: 'Ordered twice' } }]], 'Not paid yet.');
    const unpaid = await runCustomerAgent(service(null), 'refund it', { userDb: userDb({ ...paidOrder, status: 'pending_payment' }).db, userId: 'u1', history: [] });
    expect(unpaid.refunds).toEqual([]);
  });

  it('turns NO_ANSWER into no answer, so the widget offers a ticket', async () => {
    scriptModel([], 'NO_ANSWER');
    const result = await runCustomerAgent(service(null), 'what is your parking policy at events?', { userDb: null, userId: null, history: [] });
    expect(result.answer).toBeNull();
  });

  it('limits the model to MYLawatan topics and sends recent messages as context', async () => {
    scriptModel([], 'Sorry, I can only help with MYLawatan.');
    await runCustomerAgent(service(null), 'the second one', {
      userDb: null, userId: null,
      history: [{ role: 'user', text: 'find durian' }, { role: 'bot', text: 'Here are two.' }],
    });
    const [systemPrompt, contents] = mocks.callGeminiAgent.mock.calls[0];
    expect(systemPrompt).toContain('You help ONLY with MYLawatan');
    expect(systemPrompt).toContain('Sorry, I can only help with MYLawatan');
    expect((contents as { role: string }[]).map((c) => c.role)).toEqual(['user', 'model', 'user']);
  });
});
