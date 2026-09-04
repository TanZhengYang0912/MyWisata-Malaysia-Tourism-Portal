import { describe, expect, it, vi } from 'vitest';
import { processOutboxBatch } from '@/lib/integrations/outbox-worker';

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from '@/lib/supabase/service';

describe('sync outbox processor', () => {
  it('processes pending outbox events and marks them delivered on dispatcher success', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'event-1',
                      aggregate_type: 'slot_capacity',
                      aggregate_id: 'slot-123',
                      event_type: 'slot.updated',
                      payload: { booked: 5, capacity: 10 },
                      status: 'pending',
                      retry_count: 0,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update: updateMock,
      }),
    } as unknown as ReturnType<typeof createServiceClient>);

    const dispatcherMock = vi.fn().mockResolvedValue(undefined);
    const result = await processOutboxBatch(dispatcherMock);

    expect(result.processed).toBe(1);
    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(dispatcherMock).toHaveBeenCalledTimes(1);
  });

  it('handles dispatcher failure with retry backoff update', async () => {
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'event-2',
                      aggregate_type: 'slot_capacity',
                      aggregate_id: 'slot-123',
                      event_type: 'slot.booked',
                      payload: { booked: 10, capacity: 10 },
                      status: 'pending',
                      retry_count: 1,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update: updateMock,
      }),
    } as unknown as ReturnType<typeof createServiceClient>);

    const dispatcherMock = vi.fn().mockRejectedValue(new Error('Network timeout to partner API'));
    const result = await processOutboxBatch(dispatcherMock);

    expect(result.processed).toBe(1);
    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(1);
  });
});
