import { describe, expect, it } from 'vitest';
import { isUsableQueueCount, queueCount, totalAvailableQueueItems } from '../queue-summary';

describe('admin queue summaries', () => {
  it('distinguishes a real zero from inaccessible and failed queues', () => {
    expect(queueCount('available', 0)).toEqual({ availability: 'available', count: 0 });
    expect(queueCount('forbidden', 12)).toEqual({ availability: 'forbidden', count: null });
    expect(queueCount('unavailable', 12)).toEqual({ availability: 'unavailable', count: null });
    expect(isUsableQueueCount({ availability: 'available', count: 0 })).toBe(true);
  });

  it('totals only known counts and leaves no-access handling to the caller', () => {
    expect(totalAvailableQueueItems([
      { availability: 'available', count: 3 },
      { availability: 'unavailable', count: null },
      { availability: 'forbidden', count: null },
      { availability: 'available', count: 2 },
    ])).toBe(5);
  });
});
