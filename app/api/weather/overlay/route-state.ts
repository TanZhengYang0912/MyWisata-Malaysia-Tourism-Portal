const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 6;
const userRequests = new Map<string, number[]>();
const waiters: Array<() => void> = [];
let activeCalls = 0;

export function consumeWeatherOverlayRateLimit(userId: string, now = Date.now()) {
  const recent = (userRequests.get(userId) ?? []).filter((timestamp) => timestamp > now - RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    userRequests.set(userId, recent);
    return false;
  }
  recent.push(now);
  userRequests.set(userId, recent);
  return true;
}

export async function withWeatherOverlayProviderSlot<T>(work: () => Promise<T>) {
  if (activeCalls >= 3) await new Promise<void>((resolve) => waiters.push(resolve));
  activeCalls += 1;
  try {
    return await work();
  } finally {
    activeCalls -= 1;
    waiters.shift()?.();
  }
}

export function __resetWeatherOverlayRouteStateForTests() {
  userRequests.clear();
  waiters.splice(0);
  activeCalls = 0;
}
