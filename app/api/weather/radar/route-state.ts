const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const PROVIDER_CONCURRENCY = 3;
const userRequests = new Map<string, number[]>();
const providerWaiters: Array<() => void> = [];
let activeProviderCalls = 0;

export function consumeWeatherRadarRateLimit(userId: string, now = Date.now()) {
  const recent = (userRequests.get(userId) ?? []).filter((timestamp) => timestamp > now - RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    userRequests.set(userId, recent);
    return false;
  }
  recent.push(now);
  userRequests.set(userId, recent);
  return true;
}

export async function withWeatherRadarProviderSlot<T>(work: () => Promise<T>) {
  if (activeProviderCalls >= PROVIDER_CONCURRENCY) await new Promise<void>((resolve) => providerWaiters.push(resolve));
  activeProviderCalls += 1;
  try {
    return await work();
  } finally {
    activeProviderCalls -= 1;
    providerWaiters.shift()?.();
  }
}

export function __resetWeatherRadarRouteStateForTests() {
  userRequests.clear();
  providerWaiters.splice(0);
  activeProviderCalls = 0;
}
