# ADR-025: Tier Ladder & Promotion Mechanism

**Status:** Accepted  
**PR:** 025 — `025_tier_ladder.sql`

---

## Context

The platform gates earn-eligible features (recommendation submission, affiliate link generation, wallet withdrawal) behind a verification tier. Four design questions had to be resolved before implementation:

1. What are the canonical tiers and what does each unlock?
2. How does a row advance from one tier to the next?
3. Can a row ever retreat?
4. How do existing rows (demo seeds) handle backfill?

Without explicit decisions here, each developer independently interprets the spec and the enforcement logic diverges — some routes check phone, others don't, tiers slip.

---

## Decisions

### Tier Ladder (authoritative)

| Tier | How achieved | Unlocks |
|---|---|---|
| `email_verified` | Supabase auth email confirm | Browse, purchase |
| `phone_verified` | OTP via Twilio Verify | Full checkout |
| `profile_complete` | Full name + city/country + avatar + bio | Submit recommendations, generate affiliate links |
| `kyc_verified` | Admin-approved govt ID | Wallet withdrawal, full affiliate tiers |

The enum is stored in `profiles.tier`. `email_verified` is the base state for any authenticated user — there is no `guest` row in `profiles`.

### Promotion Mechanism — Per-Event RPC

Each verification event triggers a dedicated SECURITY DEFINER RPC that advances exactly one tier:

| Event | RPC |
|---|---|
| Twilio OTP confirmed | `promote_to_phone_verified(p_user_id)` |
| All profile fields present | `promote_to_profile_complete(p_user_id)` |
| Admin KYC approval | `promote_to_kyc_verified(p_user_id)` |

RPCs are not triggers (silent, hard to trace) and not computed columns (can't be backfilled or overridden). Each RPC is the single place that records the promotion.

### Strict Precondition Guard

Every promotion RPC checks `profiles.tier = '<expected predecessor>'` before writing. If the guard fails, the RPC raises an exception. This prevents:

- Out-of-order calls (KYC approval before phone verification)
- Double-promotions from concurrent requests
- Bugs where a route calls the wrong RPC

### No Regression

`profiles.tier` can only advance. There is no `demote_tier()` function. If a phone number is later changed, the phone-verified status is not revoked — that is a product decision recorded here: **phone reuse does not downgrade tier**. Admin escape hatch (see below) can set tier to any value for support cases.

### Admin Escape Hatch

`admin_set_tier(p_user_id, p_tier, p_reason)` bypasses the precondition guard and writes directly. Every call is recorded in `audit_logs`. Available to `service_role` callers only (admin API routes via `createServiceClient()`).

### Backfill for Demo Seeds (P3)

Rows created by SQL seed scripts do not have phone/profile data. On migration, these rows are set to `profile_complete` with placeholder values so feature demos work without real Twilio calls. Real user rows (non-seed) that lack prerequisites are demoted to their highest provable tier — assessed at migration time by checking which columns are non-null.

### Double-Defense Validation

`profiles.tier` is a PostgreSQL `CHECK` constrained enum. The Zod schema for any route that accepts a tier value mirrors the same set. Both layers must be updated together when a new tier is added.

---

## Scope

- **Migration**: `profiles.tier` enum column + CHECK constraint; three `promote_*` RPCs; `admin_set_tier` RPC; partial indexes on tier values for fast gate queries; P3 backfill `UPDATE` block.
- **`lib/constants.ts`**: `TIER_ORDER`, `TIER_LABELS` exported constants.
- **No breaking API changes** — tier is additive; existing routes that don't check tier are unaffected.
