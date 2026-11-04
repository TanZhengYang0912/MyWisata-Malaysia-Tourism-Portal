# ADR-027: Profile Completion — Split Endpoints, Avatar Storage & Bio Moderation

**Status:** Accepted  
**PR:** 027 — `027_profile_completion.sql`

---

## Context

`profile_complete` tier requires four profile fields: full name, city/country, avatar photo, and short bio. These fields have different validation needs, storage backends, and latency profiles. Three design questions:

1. One PATCH endpoint or separate endpoints per field group?
2. Where does avatar storage live and how is upload authorized?
3. How is bio text moderated to prevent abuse?

---

## Decisions

### Split Endpoints (M1)

Three separate routes, each owning its own Zod schema and authorization:

| Route | Fields | Tier effect |
|---|---|---|
| `PATCH /api/profile/identity` | `full_name`, `city`, `country` | Advances tier when all completion criteria met |
| `PUT /api/profile/avatar` | Returns signed upload URL | Advances tier when avatar confirmed |
| `PATCH /api/profile/bio` | `bio` (text) | Advances tier when bio passes moderation |

**Why not one PATCH /api/profile**: a single endpoint requires knowing which fields changed, deciding whether to re-run moderation on unchanged bio, and handling partial avatar upload state. Split endpoints each have a single responsibility. The tier promotion RPC (`promote_to_profile_complete`) is called by whichever route completes the final missing field — the RPC's precondition guard makes concurrent race-to-complete safe.

### Avatar Storage — Original Signed URL Pattern (Superseded)

The original design used a signed upload URL. The code change prepared on 2026-11-05 replaces this flow; the original behavior below is historical and must not be treated as the current target:

1. Client calls `PUT /api/profile/avatar` to get a short-lived Supabase Storage signed upload URL (60 s TTL, max 2 MB, MIME whitelist: `image/jpeg`, `image/png`, `image/webp`).
2. Client uploads directly to the signed URL (no proxy through Next.js server — avoids buffering large binaries through serverless functions).
3. On upload completion, client calls `POST /api/profile/avatar/confirm` which records the object path in `profiles.avatar_url` and, if it completes the profile, calls the promotion RPC.

Storage bucket: `avatars`, public (avatar URLs are displayed to other users). The old browser upload policy is not removed by the local code change alone; deployment must apply and verify the migration and storage/database permissions.

**Resize on confirm**: the prior plan referred to a Supabase Edge Function (`resize-avatar`). Its production deployment and behavior have not been verified. The new code does not rely on it.

### Avatar Storage — Current Local Implementation

The implementation prepared on 2026-11-05 accepts the final image through the authenticated Next.js route, validates the actual bytes and computes a server-side SHA-256 digest. A private `app_private.profile_avatar_assets` manifest scopes exact-byte reuse to one account. Existing same-account public avatar objects are considered only when their URL matches the configured Supabase origin, the `avatars` public-object path, and that account's storage prefix; the server downloads that exact object through Supabase Storage and verifies its digest before registering it. It does not fetch arbitrary avatar URLs or compare across accounts.

New assets use immutable, unique object paths with overwrite disabled. The database binds the active asset to `users.avatar_url` only if the previously read value has not changed. A bounded cron route claims stale unreferenced assets, deletes them through the Storage API, and records completion or retry. The former client-controlled `/api/profile/avatar/confirm` endpoint now returns `410` so an untrusted path cannot directly bind a public object.

**Deployment state:** these are local application and migration changes only. The migration, grants, policies, cron schedule, and runtime behavior have not been applied or verified against a local or hosted Supabase database. Until then, production continues to use its deployed implementation.

### Bio Moderation — OpenAI Moderation API

**2026-10-27 refinement:** Short Bio remains required. New or edited biographies must contain 3–30 trimmed characters. Previously completed profiles may retain an accepted 31–200 character biography until it is edited; profile completion still requires all other evidence. This replaces the implementation's former 30–200 range and does not adopt the optional-bio proposal. See `docs/plans/2026-10-27-1648-required-short-bio-length.md` and migration `20261027085814_required_short_bio_length.sql`.

All bio submissions pass through OpenAI's free Moderation API (`POST https://api.openai.com/v1/moderations`) before being written to the database. This is **synchronous and fail-closed**:

- If the API returns `results[0].flagged = true`, the submission is rejected with 422 and `code: 'bio_content_rejected'`.
- If the API call fails (timeout, 5xx), the submission is **rejected** — not allowed through. Rationale: allowing unmoderated content on failure would turn moderation into opt-in by downtime. Fail-closed keeps the guarantee.

### Violation Escalation

Repeat violations escalate:

| Violation count | Consequence |
|---|---|
| 1–2 | Instant reject, 422 response |
| 3 | 7-day bio submission cooldown |
| 5+ | Permanent flag — requires admin review to lift |

Violation count is stored in `profiles.bio_violation_count`. The escalation logic runs in `PATCH /api/profile/bio` before calling the moderation API — if the user is in cooldown or permanently flagged, the API call is skipped.

---

## Scope

- **Migration**: `users.bio_violation_count` and `users.bio_cooldown_until`; `users.avatar_url` already exists. The new private asset manifest is defined in `docs/plans/2026-11-04-2020-profile-storage-and-write-efficiency.md` and its local migration; deployment is pending.
- **`app/api/profile/identity/route.ts`**: new route.
- **`app/api/profile/avatar/route.ts`** + **`app/api/profile/avatar/confirm/route.ts`**: existing routes; the current local implementation accepts validated bytes server-side and retires client-controlled confirmation.
- **`app/api/profile/bio/route.ts`**: new route with moderation call.
- **`lib/moderation.ts`**: `moderateBio(text: string): Promise<{ flagged: boolean }>` wrapper.
- **`lib/validation/profile-schemas.ts`**: schemas for all three endpoint bodies.
- **Supabase Edge Function**: legacy design referenced `resize-avatar`; deployment and current use remain unverified.
