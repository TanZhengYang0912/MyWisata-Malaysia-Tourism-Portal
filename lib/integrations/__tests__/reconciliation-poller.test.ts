import { describe, expect, it, vi } from 'vitest';
import { reconcileExternalFeed } from '@/lib/integrations/reconciliation-poller';

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from '@/lib/supabase/service';

describe('reconcileExternalFeed', () => {
  const sourceId = 'src-airbnb-1';

  it('applies feed items and counts confirmations and conflicts accurately', async () => {
    const rpcMock = vi.fn()
      .mockResolvedValueOnce({ data: { success: true, action: 'confirmed' }, error: null })
      .mockResolvedValueOnce({ data: { success: false, conflict: 'overbooked' }, error: null });

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: sourceId, sync_enabled: true },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      rpc: rpcMock,
    } as unknown as ReturnType<typeof createServiceClient>);

    const report = await reconcileExternalFeed(sourceId, [
      {
        externalBookingId: 'ext-1',
        slotId: 'slot-1',
        quantity: 2,
        status: 'confirmed',
        guestName: 'John Doe',
      },
      {
        externalBookingId: 'ext-2',
        slotId: 'slot-1',
        quantity: 5,
        status: 'confirmed',
        guestName: 'Jane Smith',
      },
    ]);

    expect(report.totalFeedItems).toBe(2);
    expect(report.appliedCount).toBe(1);
    expect(report.conflictCount).toBe(1);
    expect(report.errors.length).toBe(0);
  });

  it('aborts when source is not found or sync is disabled', async () => {
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: sourceId, sync_enabled: false },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof createServiceClient>);

    const report = await reconcileExternalFeed(sourceId, []);
    expect(report.errors[0]).toContain('Sync is disabled');
  });
});
