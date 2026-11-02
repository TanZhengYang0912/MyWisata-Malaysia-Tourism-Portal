// App-level HTTP request correlation id — distinct from Stripe SDK's own
// error.requestId (see app/api/stripe/connect-onboard/route.ts), which only
// correlates a single call to Stripe's API, not our own request/response.
// Vercel sets `x-vercel-id` on every incoming request; falls back to a fresh
// UUID for local dev or any other host.
export function createRequestId(): string {
  return crypto.randomUUID();
}

export function getRequestId(request: Request): string {
  return request.headers.get('x-vercel-id') ?? createRequestId();
}
