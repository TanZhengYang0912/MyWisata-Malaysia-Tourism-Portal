# ADR-028: Tier Gate Enforcement Pattern

**Status:** Accepted  
**PR:** 028 — (schema-only, no migration file)

---

## Context

Several API routes must reject requests from users who have not reached a required tier. Two places can enforce this check: the Next.js route handler (application layer) and the SECURITY DEFINER RPC that executes the action (database layer). The question is whether to enforce at one layer or both.

A single-layer approach at the route level is simpler but means that any direct RPC call (e.g. from a test harness, a future admin tool, or a regression where the route check is bypassed) silently bypasses the gate. A single-layer approach at the RPC level is safe but returns a generic DB error that is hard to present as a user-facing message.

---

## Decisions

### Dual-Layer (G3)

Every tier-gated operation enforces the gate at **both** layers:

**Route layer (fast fail)**:

```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('tier')
  .eq('id', user.id)
  .single();

if (!meetsMinTier(profile.tier, REQUIRED_TIER.PROFILE_COMPLETE)) {
  return apiFail('TIER_INSUFFICIENT', 'Profile completion required', 403);
}
```

This returns a clean 403 with a structured error code before any DB write is attempted, enabling the frontend to redirect the user to the verification wizard.

**RPC layer (source of truth)**:

```sql
IF (SELECT tier FROM profiles WHERE id = p_user_id) < p_required_tier THEN
  RAISE EXCEPTION 'tier_insufficient: % required', p_required_tier;
END IF;
```

The RPC raises an exception that rolls back the transaction. This ensures correctness even if the route-layer check is absent or bypassed.

### Constants in `lib/constants.ts`

Tier strings and the required tier per feature are defined once:

```typescript
export const TIER = {
  EMAIL_VERIFIED:   'email_verified',
  PHONE_VERIFIED:   'phone_verified',
  PROFILE_COMPLETE: 'profile_complete',
  KYC_VERIFIED:     'kyc_verified',
} as const;

export const REQUIRED_TIER = {
  CHECKOUT:          TIER.PHONE_VERIFIED,
  RECOMMENDATION:    TIER.PROFILE_COMPLETE,
  AFFILIATE_BASIC:   TIER.PROFILE_COMPLETE,
  AFFILIATE_FULL:    TIER.KYC_VERIFIED,
  WITHDRAWAL:        TIER.KYC_VERIFIED,
} as const;
```

`meetsMinTier(actual, required)` compares using `TIER_ORDER` array index — a string comparison would break if the enum order ever changes.

### Why Not RPC-Only

The route layer check exists to produce a **structured, actionable 403** that the frontend can use to redirect to the wizard. An RPC exception surfaces as a generic `DB_ERROR` 500 unless the route explicitly pattern-matches the error message string — brittle and not idiomatic. The route check handles UX; the RPC check handles correctness.

### Why Not Route-Only

If a future script, admin tool, or test calls the RPC directly, the tier gate is bypassed. Defense-in-depth at the DB layer means the invariant holds regardless of caller.

---

## Scope

- **`lib/constants.ts`**: `TIER`, `TIER_ORDER`, `REQUIRED_TIER`, `meetsMinTier()` exported.
- **All gated routes**: import `meetsMinTier` and check before the main RPC call.
- **All gated RPCs**: include tier precondition guard block.
- **No migration file** — this ADR describes a pattern, not a single migration. Each PR that implements a gated feature follows this pattern.
