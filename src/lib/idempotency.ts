// P-TMF Idempotency helper
// Prevents duplicate money-writing operations from client retries / double-clicks.
//
// Usage in a POST handler:
//   const idem = await withIdempotency(request, user.id, '/api/wallet/withdraw', payload);
//   if (idem.replayed) return idem.replayed;   // safely returns previous response
//   // ... do the work ...
//   return idem.record(response, status);      // saves for future replays

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

const IDEMPOTENCY_HEADER = 'idempotency-key';

interface IdempotencyOk {
  replayed: null;
  record: (body: unknown, statusCode?: number) => Promise<Response>;
}

interface IdempotencyReplay {
  replayed: Response;
  record: never;
}

export async function withIdempotency(
  request: Request,
  userId: string,
  endpoint: string,
  payload: unknown,
): Promise<IdempotencyOk | IdempotencyReplay> {
  const key = request.headers.get(IDEMPOTENCY_HEADER);

  // No key provided: still allow the operation but no dedup safety
  if (!key) {
    return {
      replayed: null,
      record: async (body, status = 200) => Response.json(body, { status }),
    };
  }

  if (key.length < 16 || key.length > 128) {
    return {
      replayed: Response.json(
        { data: null, error: { code: 'INVALID_IDEMPOTENCY_KEY', message: 'Key must be 16-128 chars' } },
        { status: 400 },
      ),
    } as unknown as IdempotencyReplay;
  }

  const requestHash = hashPayload(endpoint, payload);
  const db = await createClient();

  // Check for existing record
  const { data: existing } = await db
    .from('idempotency_keys')
    .select('request_hash, response_body, status_code')
    .eq('key', key)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    if (existing.request_hash !== requestHash) {
      return {
        replayed: Response.json(
          {
            data: null,
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'Same idempotency key used with different payload',
            },
          },
          { status: 409 },
        ),
      } as unknown as IdempotencyReplay;
    }
    // Safe replay — return the stored response
    return {
      replayed: Response.json(existing.response_body, { status: existing.status_code ?? 200 }),
    } as unknown as IdempotencyReplay;
  }

  return {
    replayed: null,
    record: async (body, status = 200) => {
      // Insert record BEFORE returning response so future replays see it
      const { error } = await db.from('idempotency_keys').insert({
        key,
        user_id:       userId,
        endpoint,
        request_hash:  requestHash,
        response_body: body as never,
        status_code:   status,
      });
      if (error && !error.message.includes('duplicate')) {
        console.error('[idempotency] failed to record', error);
      }
      return Response.json(body, { status });
    },
  };
}

function hashPayload(endpoint: string, payload: unknown): string {
  const canonical = endpoint + ':' + JSON.stringify(sortKeys(payload));
  return createHash('sha256').update(canonical).digest('hex').slice(0, 64);
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = sortKeys((value as Record<string, unknown>)[k]);
      return acc;
    }, {});
}

/**
 * Housekeeping — call from a scheduled task to purge expired keys.
 * Skipped in demo; provided for production.
 */
export async function purgeExpiredIdempotencyKeys(db: SupabaseClient): Promise<number> {
  const { count } = await db
    .from('idempotency_keys')
    .delete({ count: 'exact' })
    .lt('expires_at', new Date().toISOString());
  return count ?? 0;
}
