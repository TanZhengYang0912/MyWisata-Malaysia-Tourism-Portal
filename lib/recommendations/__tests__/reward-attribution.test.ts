import { describe, expect, it, vi } from 'vitest';
import { attributeRecommendationReward } from '@/lib/recommendations/reward-attribution';

function serviceFor(options: { rpcError?: { code?: string; message: string }; rpcData?: string | null; attributionEndsAt?: string | null; vendorIds?: string[] } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: options.rpcData === undefined ? 'commission-1' : options.rpcData, error: options.rpcError ?? null });
  const service = {
    from(table: string) {
      if (table === 'orders') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'order-1', status: 'PAID', total_amount: 200 } }) }) }) };
      if (table === 'order_items') return { select: () => ({ eq: async () => ({ data: (options.vendorIds ?? ['vendor-1']).map((vendor_id) => ({ vendor_id })) }) }) };
      if (table === 'recommendation_conversions') return { select: () => ({ eq: (_column: string, vendorId: string) => ({ maybeSingle: async () => ({ data: { id: `conversion-${vendorId}`, recommendation_id: 'recommendation-1', first_sale_awarded_at: null, attribution_ends_at: options.attributionEndsAt ?? null, vendor_recommendations: { recommender_id: `recommender-${vendorId}` } } }) }) }) };
      throw new Error(`unexpected table ${table}`);
    },
    rpc,
  };
  return { service, rpc };
}

describe('attributeRecommendationReward', () => {
  it('creates a single RM50 pending first-sale reward through the atomic RPC', async () => {
    const { service, rpc } = serviceFor();

    await expect(attributeRecommendationReward(service as never, 'order-1')).resolves.toMatchObject({ kind: 'created', rewards: [{ recommenderId: 'recommender-vendor-1', amountSen: 5000 }] });
    expect(rpc).toHaveBeenCalledWith('credit_pending_recommendation', expect.objectContaining({ p_user_id: 'recommender-vendor-1', p_amount_sen: 5000, p_commission_type: 'bonus', p_order_id: 'order-1' }));
  });

  it('treats a null RPC result as an already-attributed order', async () => {
    const { service, rpc } = serviceFor({ rpcData: null });

    await expect(attributeRecommendationReward(service as never, 'order-1')).resolves.toEqual({ kind: 'skipped' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('creates one pending reward for every converted vendor in a paid order', async () => {
    const { service, rpc } = serviceFor({ vendorIds: ['vendor-1', 'vendor-2'] });

    await expect(attributeRecommendationReward(service as never, 'order-1')).resolves.toMatchObject({ kind: 'created', rewards: [{ recommenderId: 'recommender-vendor-1' }, { recommenderId: 'recommender-vendor-2' }] });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('does not award a sale after the conversion window closes', async () => {
    const { service, rpc } = serviceFor({ attributionEndsAt: '2020-01-01T00:00:00.000Z' });

    await expect(attributeRecommendationReward(service as never, 'order-1')).resolves.toEqual({ kind: 'skipped' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
