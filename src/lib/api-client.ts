// Client-side POST helper for Member 3 (and everyone else).
// Auto-generates Idempotency-Key for money-writing endpoints and returns
// the typed { data | error } envelope defined in src/lib/validation/schemas.ts.
//
// Usage:
//   const res = await apiPost<{ request_id: string }>('/api/wallet/withdraw', { amount });
//   if (res.error) toast.error(friendlyError(res.error.code));
//   else toast.success('Submitted!');

import type { ApiResponse } from '@/types';

export interface ApiPostOptions {
  /** Skip Idempotency-Key generation. Default: true (send key). */
  idempotency?: boolean;
  /** Reuse an existing idempotency key across retries. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function apiPost<T>(
  endpoint: string,
  body: unknown,
  opts: ApiPostOptions = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.idempotency !== false) {
    headers['Idempotency-Key'] = opts.idempotencyKey ?? crypto.randomUUID();
  }
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: opts.signal,
    });
    return (await res.json()) as ApiResponse<T>;
  } catch (err) {
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: err instanceof Error ? err.message : 'Network error',
      },
    };
  }
}

// ── Error code → user-facing message ────────────────────────

const FRIENDLY: Record<string, string> = {
  VALIDATION_FAILED:       'Please check the highlighted fields.',
  INVALID_JSON:            'Request malformed — please try again.',
  UNAUTHORIZED:            'Session expired — please sign in again.',
  FORBIDDEN:               'You do not have permission for this action.',
  KYC_REQUIRED:            'Complete KYC verification before requesting a withdrawal.',
  INSUFFICIENT_BALANCE:    'Not enough available balance.',
  PROFILE_INCOMPLETE:      'Complete your profile before submitting.',
  PENDING_SUBMISSION_EXISTS: 'A pending submission already exists.',
  COOLDOWN_ACTIVE:         'Please wait before re-submitting.',
  RATE_LIMITED:            'Too many similar submissions — please diversify.',
  INVALID_ACTION:          'Action not allowed in current state.',
  INVALID_STATE:           'Action not allowed in current state.',
  ALREADY_ACTED:           'You have already acted on this request.',
  SELF_APPROVAL_FORBIDDEN: 'You cannot approve your own request.',
  IDEMPOTENCY_CONFLICT:    'This action was already submitted.',
  INVALID_IDEMPOTENCY_KEY: 'Invalid idempotency key.',
  NOT_FOUND:               'Resource not found.',
  VENDOR_NOT_FOUND:        'Target vendor does not exist.',
  DB_ERROR:                'Database error — please try again.',
  RPC_ERROR:               'Server error — please try again.',
  NETWORK_ERROR:           'Network error — check your connection.',
};

export function friendlyError(code: string, fallback = 'Something went wrong.'): string {
  return FRIENDLY[code] ?? fallback;
}
