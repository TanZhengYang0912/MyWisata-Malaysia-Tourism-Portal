import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ row: null as { id: string } | null, filters: [] as Array<[string, string]> }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('not found'); },
  permanentRedirect: (url: string) => { throw new Error(`redirect:${url}`); },
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from: () => {
  const query = {
    select: () => query,
    eq: (column: string, value: string) => { state.filters.push([column, value]); return query; },
    maybeSingle: async () => ({ data: state.row }),
  };
  return query;
} }) }));
import LegacyOutletPage from '@/app/customer/vendor/[vendorId]/outlet/[outletId]/page';

describe('legacy nested outlet redirects', () => {
  beforeEach(() => { state.filters = []; state.row = { id: 'outlet' }; });
  it('checks association and retains booking and attribution query parameters', async () => {
    await expect(LegacyOutletPage({ params: Promise.resolve({ vendorId: 'vendor', outletId: 'outlet' }), searchParams: Promise.resolve({ checkin: '2026-12-01', campaign: 'a b' }) }))
      .rejects.toThrow('redirect:/customer/outlets/outlet?checkin=2026-12-01&campaign=a+b');
    expect(state.filters).toContainEqual(['vendor_id', 'vendor']);
    expect(state.filters).toContainEqual(['review_status', 'approved']);
  });
  it('returns not found when the outlet does not belong to the vendor', async () => {
    state.row = null;
    await expect(LegacyOutletPage({ params: Promise.resolve({ vendorId: 'wrong', outletId: 'outlet' }) })).rejects.toThrow('not found');
  });
});
