import { describe, expect, it, vi } from 'vitest';
import { processOutboxBatch } from '@/lib/integrations/outbox-worker';

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from '@/lib/supabase/service';

function configureOutbox(events: unknown[], updateMock = vi.fn()) {
  const claimQuery = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'event-1' }, error: null }),
  };
  const writeQuery = { eq: vi.fn().mockResolvedValue({ error: null }) };
  updateMock.mockReturnValueOnce(claimQuery).mockReturnValue(writeQuery);
  vi.mocked(createServiceClient).mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          lte: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: events, error: null }),
            }),
          }),
        }),
      }),
      update: updateMock,
    }),
  } as unknown as ReturnType<typeof createServiceClient>);
  return { claimQuery, updateMock };
}

describe('sync outbox processor', () => {
  it('requires a dispatcher before it creates a service client or reads pending events', async () => {
    await expect(processOutboxBatch(undefined as never)).rejects.toThrow('outbox_dispatcher_required');
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('processes pending outbox events and marks them delivered on dispatcher success', async () => {
    const { claimQuery, updateMock } = configureOutbox([{
      id: 'event-1',
      aggregate_type: 'slot_capacity',
      aggregate_id: 'slot-123',
      event_type: 'slot.updated',
      payload: { booked: 5, capacity: 10 },
      status: 'pending',
      retry_count: 0,
    }]);

    const dispatcherMock = vi.fn().mockResolvedValue(undefined);
    const result = await processOutboxBatch(dispatcherMock);

    expect(result.processed).toBe(1);
    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(0);
    expect(dispatcherMock).toHaveBeenCalledTimes(1);
    expect(claimQuery.in).toHaveBeenCalledWith('status', ['pending', 'failed']);
    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it('handles dispatcher failure with retry backoff update', async () => {
    configureOutbox([{
      id: 'event-2',
      aggregate_type: 'slot_capacity',
      aggregate_id: 'slot-123',
      event_type: 'slot.booked',
      payload: { booked: 10, capacity: 10 },
      status: 'pending',
      retry_count: 1,
    }]);

    const dispatcherMock = vi.fn().mockRejectedValue(new Error('Network timeout to partner API'));
    const result = await processOutboxBatch(dispatcherMock);

    expect(result.processed).toBe(1);
    expect(result.delivered).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('does not count a dispatch as delivered when the delivery state cannot be persisted', async () => {
    const updateMock = vi.fn();
    const { claimQuery } = configureOutbox([{
      id: 'event-3',
      aggregate_type: 'slot_capacity',
      aggregate_id: 'slot-123',
      event_type: 'slot.updated',
      payload: { booked: 5, capacity: 10 },
      status: 'pending',
      retry_count: 0,
    }], updateMock);
    const failedDeliveryWrite = { eq: vi.fn().mockResolvedValue({ error: { message: 'database unavailable' } }) };
    const retryWrite = { eq: vi.fn() };
    retryWrite.eq.mockReturnValueOnce(retryWrite).mockResolvedValueOnce({ error: null });
    updateMock.mockReset()
      .mockReturnValueOnce(claimQuery)
      .mockReturnValueOnce(failedDeliveryWrite)
      .mockReturnValueOnce(retryWrite);

    const result = await processOutboxBatch(vi.fn().mockResolvedValue(undefined));

    expect(result).toEqual({ processed: 1, delivered: 0, failed: 1 });
    expect(updateMock).toHaveBeenCalledTimes(3);
    expect(updateMock.mock.calls[2]?.[0]).toMatchObject({ status: 'pending', retry_count: 1, last_error: 'delivery_state_update_failed' });
  });
});
