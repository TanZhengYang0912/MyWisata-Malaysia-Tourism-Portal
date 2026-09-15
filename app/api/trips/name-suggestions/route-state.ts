const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 10;
const requestsByUser = new Map<string, number[]>();

export function consumeTripNameSuggestionRateLimit(userId: string, now = Date.now()) {
  const recent = (requestsByUser.get(userId) ?? [])
    .filter((timestamp) => timestamp > now - RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    requestsByUser.set(userId, recent);
    return false;
  }
  recent.push(now);
  requestsByUser.set(userId, recent);
  return true;
}

export function __resetTripNameSuggestionRouteStateForTests() {
  requestsByUser.clear();
}
