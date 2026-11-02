import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ notify: vi.fn(), rpc: vi.fn() }));
vi.mock('../settings', () => ({ getClearanceDays: async () => 7 }));
vi.mock('../fraud', () => ({ runFraudSweep: async () => undefined }));
vi.mock('../tier', () => ({ getTierForUser: async () => ({ tierName: 'Starter', rate: 0.03 }) }));
vi.mock('../notifications', () => ({ notifyCommissionCleared: mocks.notify, notifyCommissionRejected: vi.fn(), notifyTierUp: vi.fn() }));
import { acceptAttribution, clearMaturedCommissions } from '../clearing';

function fixture(creditFails = false) {
  const attribution = { id: 'attribution-1', click_id: 'click-1', order_id: 'order-1', commission_amount: 10, created_at: new Date(Date.now() - 8 * 86_400_000).toISOString(), status: 'pending' };
  const tables: Record<string, Record<string, unknown>[]> = {
    affiliate_attributions: [attribution], affiliate_clicks: [{ id: 'click-1', link_id: 'link-1' }],
    affiliate_links: [{ id: 'link-1', user_id: 'owner-1' }], users: [{ id: 'owner-1', tier: 'kyc_verified', kyc_status: 'approved' }],
    orders: [{ id: 'order-1', status: 'paid' }], wallets: [{ id: 'wallet-1', user_id: 'owner-1' }],
  };
  mocks.rpc.mockImplementation(async (name: string, args?: { p_cutoff?: string }) => {
    if (creditFails) return { data: null, error: { message: 'synthetic ledger unavailable' } };
    if (name === 'claim_affiliate_job') return { data: { outcome: 'claimed', token: 'lease-1', cutoff: args?.p_cutoff }, error: null };
    if (name === 'get_affiliate_pending_clear_batch') return { data: attribution.status === 'pending' ? [attribution] : [], error: null };
    if (name === 'advance_affiliate_job') return { data: true, error: null };
    if (name !== 'clear_affiliate_commission') return { data: null, error: { message: 'split credit must not be used' } };
    if (attribution.status !== 'pending') return { data: { outcome: 'skipped' }, error: null };
    attribution.status = 'confirmed';
    return { data: { outcome: 'confirmed', user_id: 'owner-1', order_id: 'order-1', amount_rm: 10 }, error: null };
  });
  const service = {
    rpc: mocks.rpc,
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let patch: Record<string, unknown> | null = null;
      const value = () => { if (patch) rows.forEach((row) => Object.assign(row, patch)); return { data: rows, error: null }; };
      const chain = {
        select: () => chain,
        eq: (key: string, expected: unknown) => { rows = rows.filter((row) => row[key] === expected); return chain; },
        lt: () => chain,
        update: (changes: Record<string, unknown>) => { patch = changes; return chain; },
        maybeSingle: async () => ({ ...value(), data: value().data[0] ?? null }),
        then: (resolve: (result: ReturnType<typeof value>) => unknown) => Promise.resolve(value()).then(resolve),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { service, attribution };
}

describe('atomic affiliate clearing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps a failed wallet credit pending so a later run can retry', async () => {
    const { service, attribution } = fixture(true);
    expect((await acceptAttribution(service, attribution.id)).outcome).toBe('error');
    expect(attribution.status).toBe('pending');
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('uses one canonical RPC for manual acceptance and does not notify on replay', async () => {
    const { service, attribution } = fixture();
    expect(await acceptAttribution(service, attribution.id)).toEqual({ outcome: 'confirmed', amountRM: 10 });
    expect(mocks.rpc).toHaveBeenCalledWith('clear_affiliate_commission', { p_attribution_id: attribution.id, p_matured_before: null });
    expect((await acceptAttribution(service, attribution.id)).outcome).toBe('skipped');
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it('passes the batch maturity cutoff into the same atomic operation', async () => {
    const { service, attribution } = fixture();
    const before = Date.now() - 7 * 86_400_000;
    const result = await clearMaturedCommissions(service);
    expect(result.cleared).toHaveLength(1);
    const [name, args] = mocks.rpc.mock.calls.find(([rpcName]) => rpcName === 'clear_affiliate_commission') as [string, { p_attribution_id: string; p_matured_before: string }];
    expect(name).toBe('clear_affiliate_commission');
    expect(args.p_attribution_id).toBe(attribution.id);
    expect(Date.parse(args.p_matured_before)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(args.p_matured_before)).toBeLessThanOrEqual(Date.now() - 7 * 86_400_000);
  });

  it('keeps an attribution pending when its order requires operational review', async () => {
    const { service, attribution } = fixture();
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'clear_affiliate_commission') {
        return { data: { outcome: 'order_review_required', reason: 'pickup_unconfirmed' }, error: null };
      }
      return { data: null, error: null };
    });

    const accepted = await acceptAttribution(service, attribution.id);

    expect(accepted).toEqual({ outcome: 'order_review_required', reason: 'pickup_unconfirmed' });
    expect(attribution.status).toBe('pending');
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
