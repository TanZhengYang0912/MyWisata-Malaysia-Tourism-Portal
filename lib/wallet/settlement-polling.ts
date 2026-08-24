const ACTIVE_SETTLEMENT_STATUSES = new Set(['approved', 'processing']);

export function isSettlementPending(status: string): boolean {
  return ACTIVE_SETTLEMENT_STATUSES.has(status);
}

export function settlementPollDelay(attempt: number): number {
  return Math.min(2_000 * (2 ** Math.max(0, attempt)), 15_000);
}

export function startSettlementPolling(input: {
  refresh: () => Promise<unknown>;
  shouldContinue: () => boolean;
}): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (attempt: number) => {
    if (stopped || !input.shouldContinue()) return;
    timer = setTimeout(async () => {
      timer = null;
      if (stopped || !input.shouldContinue()) return;
      try {
        await input.refresh();
      } finally {
        if (!stopped && input.shouldContinue()) schedule(attempt + 1);
      }
    }, settlementPollDelay(attempt));
  };

  schedule(0);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
