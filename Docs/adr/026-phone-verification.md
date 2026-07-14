# ADR-026: Phone Verification Architecture

**Status:** Accepted  
**PR:** 026 — `026_phone_verification.sql`

---

## Context

The spec requires phone verification as the gate to `phone_verified` tier (full checkout). Three questions had to be resolved:

1. Build raw OTP (custom TOTP/HOTP + SMS) or use a managed service?
2. Must a verified phone be globally unique across the platform?
3. What rate limits and pre/post collision checks are needed?

The existing DB schema pre-reserved `profiles.phone` and `profiles.phone_verified_at` but the UI flow was commented out and no SMS integration existed.

---

## Decisions

### Managed OTP — Twilio Verify

Twilio Verify is used rather than building raw OTP. Reasons:

- Twilio handles OTP generation, expiry, attempt counting, and carrier routing.
- Raw OTP requires storing a secret or hash server-side and implementing the same logic manually — more surface area, same outcome.
- Twilio Verify is the industry standard for consumer phone verification (used by Airbnb, Stripe, etc.).

The integration is two API calls: `services/{sid}/verifications` (send) and `services/{sid}/verification-checks` (verify). No OTP value is stored in the application DB.

### Split Endpoints

Two separate Next.js API routes, not one route with an `action` field:

- `POST /api/phone/send-otp` — validates phone format, calls Twilio Verify create, records send attempt.
- `POST /api/phone/verify-otp` — calls Twilio Verify check, on success calls `promote_to_phone_verified()` RPC.

Splitting makes each route's schema, rate-limit, and authorization logic independent and easier to test.

### Globally Unique Verified Phone (U2)

A phone number may only be verified on one account at a time. This is enforced by a **partial UNIQUE index**:

```sql
CREATE UNIQUE INDEX idx_profiles_verified_phone
  ON profiles(phone)
  WHERE phone_verified_at IS NOT NULL;
```

Unverified phone values (`phone_verified_at IS NULL`) are not constrained — users may update their phone number freely before verifying. The constraint only applies once verification completes.

**Why partial, not full UNIQUE**: if full uniqueness were enforced, a user who typed a wrong number would block that number globally even before verifying. The partial index ensures only verified ownership creates a claim.

### Pre/Post Collision Checks

**Pre-send check** (in `send-otp` route): before calling Twilio, query `profiles WHERE phone = $1 AND phone_verified_at IS NOT NULL AND id != auth.uid()`. If a row exists, return 409 CONFLICT with `code: 'phone_already_claimed'` — do not send the OTP. This avoids burning a Twilio send on a number that will fail at verify time.

**Post-verify check** (inside `promote_to_phone_verified` RPC): the RPC runs the same check under an advisory lock (`pg_advisory_xact_lock(hashtext(p_phone))`) before writing `phone_verified_at`. This closes the TOCTOU gap between pre-send check and the actual promotion write.

### Rate Limits

| Operation | Limit |
|---|---|
| OTP sends per phone per hour | 3 |
| Verify attempts per token | 5 (Twilio default, not configurable here) |

Rate limit state is stored in Redis (or Upstash) with TTL, not in PostgreSQL. Exceeding the send limit returns 429 with `code: 'rate_limited'`.

---

## Scope

- **Migration**: advisory lock helper; no new columns (pre-reserved); partial UNIQUE index.
- **`app/api/phone/send-otp/route.ts`**: new route.
- **`app/api/phone/verify-otp/route.ts`**: new route + `promote_to_phone_verified` RPC call.
- **`lib/twilio.ts`**: thin wrapper over Twilio Verify REST API.
- **`lib/validation/phone-schemas.ts`**: E.164 phone format Zod schema.
- **Env**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` added to `.env.local.example`.
