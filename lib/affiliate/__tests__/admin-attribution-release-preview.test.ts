import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { getAdminAffiliateAttributionPage } from '../admin-stats';

describe('admin affiliate attribution release preview', () => {
  it('returns a bounded blocker preview and uses the configured maturity window', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'get_admin_affiliate_attribution_page') return { data: {
        snapshotCutoff: '2026-10-25T00:00:00.000Z', totalCount: 1, pageSize: 10, hasMore: false, nextCursor: null,
        items: [{ id: 'attribution-1', userId: 'user-1', userName: 'Test', productId: null, productName: null,
          orderId: 'order-1', commissionAmount: 0.42, status: 'pending', createdAt: '2026-10-01T00:00:00.000Z',
          reviewStatus: null, reviewVersion: null, reviewEvidence: null }],
      }, error: null };
      if (name === 'get_affiliate_order_release_preview') return { data: [{ id: 'attribution-1', reason: 'order_exception_open' }], error: null };
      throw new Error(`Unexpected RPC ${name}`);
    });
    const service = {
      rpc,
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: '3' }, error: null }) }) }) }),
    } as unknown as SupabaseClient;

    const page = await getAdminAffiliateAttributionPage(service);

    expect(rpc).toHaveBeenCalledWith('get_affiliate_order_release_preview', { p_attribution_ids: ['attribution-1'] });
    expect(page.items[0]).toMatchObject({
      commissionAmount: 0.42,
      releaseCheck: { reason: 'order_exception_open', orderChecksPassed: false, matured: true },
    });
    expect(Date.parse(page.items[0].releaseCheck!.eligibleAfter!)).toBe(Date.parse('2026-10-04T00:00:00.000Z'));
  });
});
