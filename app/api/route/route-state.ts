const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const MAX_TRACKED_USERS = 1_000;
const MAX_WAITERS = 40;
const userRequests = new Map<string, number[]>();
const waiters: Array<() => void> = [];
let activeCalls = 0;

export function consumeRouteRateLimit(userId: string, now = Date.now()) {
  const recent = (userRequests.get(userId) ?? []).filter((timestamp) => timestamp > now - RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    userRequests.set(userId, recent);
    return false;
  }
  recent.push(now);
  if (!userRequests.has(userId) && userRequests.size >= MAX_TRACKED_USERS) {
    const oldestUserId = userRequests.keys().next().value;
    if (oldestUserId) userRequests.delete(oldestUserId);
  }
  userRequests.set(userId, recent);
  return true;
}

export async function withRouteProviderSlot<T>(work: () => Promise<T>): Promise<T | null> {
  if (activeCalls >= 4) {
    if (waiters.length >= MAX_WAITERS) return null;
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  activeCalls += 1;
  try {
    return await work();
  } finally {
    activeCalls -= 1;
    waiters.shift()?.();
  }
}

export function __resetRouteStateForTests() {
  userRequests.clear();
  waiters.splice(0);
  activeCalls = 0;
}
