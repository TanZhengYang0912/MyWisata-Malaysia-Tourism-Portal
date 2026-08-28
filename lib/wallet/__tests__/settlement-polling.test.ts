import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSettlementPending, settlementPollDelay, startSettlementPolling } from '@/lib/wallet/settlement-polling';

afterEach(() => vi.useRealTimers());

describe('settlement polling', () => {
  it('recognizes only provider-settlement states as active', () => {
    expect(isSettlementPending('approved')).toBe(true);
    expect(isSettlementPending('processing')).toBe(true);
    expect(isSettlementPending('paid')).toBe(false);
    expect(isSettlementPending('failed')).toBe(false);
  });

  it('backs off polling with a bounded delay', () => {
    expect(settlementPollDelay(0)).toBe(2_000);
    expect(settlementPollDelay(1)).toBe(4_000);
    expect(settlementPollDelay(10)).toBe(15_000);
  });

  it('never overlaps requests and stops cleanly', async () => {
    vi.useFakeTimers();
    let active = true;
    const pending = { resolve: () => undefined as void };
    const refresh = vi.fn(() => new Promise<void>((resolve) => { pending.resolve = resolve; }));
    const stop = startSettlementPolling({ refresh, shouldContinue: () => active });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    pending.resolve();
    await Promise.resolve();
    active = false;
    await vi.advanceTimersByTimeAsync(4_000);
    expect(refresh).toHaveBeenCalledTimes(1);

    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
