# ADR-002: SECURITY DEFINER RPCs for all money movements

**Status:** Accepted

## Decision

Every function that touches `wallets`, `wallet_transactions`, or `withdrawal_requests` is a `SECURITY DEFINER` PostgreSQL function callable via `supabase.rpc()`. No client code runs raw `UPDATE wallets SET ...` or `INSERT INTO wallet_transactions`.

## Rationale

The platform uses Supabase with the anon key exposed in the browser (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Without SECURITY DEFINER RPCs, a malicious client could craft arbitrary DML against money tables — crediting their own wallet, forging withdrawal records, or bypassing dual-approval logic. RLS alone cannot guard against a client who constructs valid rows; the business logic (balance check, ledger entry, idempotency) must execute atomically in a trusted context. SECURITY DEFINER functions run as the function owner (postgres), not the calling role, so RLS on the underlying tables becomes a second-layer defense rather than the primary gate.
