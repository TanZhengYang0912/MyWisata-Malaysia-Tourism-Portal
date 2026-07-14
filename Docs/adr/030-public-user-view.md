# ADR-030: Public User Data via `public_users` View

**Status:** Accepted  
**PR:** 030 — `030_public_user_view.sql`

---

## Context

Several parts of the platform display user information to other users: recommendation posts show the recommender's name and avatar; vendor pages show a "Verified Contributor" badge; affiliate attribution shows the referrer's display name. At the same time, `profiles` contains sensitive columns that must never be exposed publicly: `phone`, `phone_verified_at`, `kyc_document_url`, `bio_violation_count`, `bio_cooldown_until`, `tier` (business-sensitive).

Without a defined boundary, any developer querying `profiles` for a public display feature may accidentally `SELECT *` and expose private columns. The question is how to enforce column-level data isolation for public-facing queries.

---

## Decisions

### Two-Round Defense: Table RLS + View RLS (S3)

**Round 1 — Table-level RLS on `profiles`**:

```sql
-- Users can only SELECT their own full row
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Service role bypasses RLS (admin routes use createServiceClient())
```

Direct queries to `profiles` from browser context return only the authenticated user's own row. This prevents cross-user data access at the table level.

**Round 2 — `public_users` view with explicit column list**:

```sql
CREATE VIEW public_users AS
SELECT
  id,
  full_name,
  avatar_url,
  city,
  country,
  kyc_verified_at IS NOT NULL AS is_kyc_verified,
  created_at
FROM profiles;
```

The view deliberately excludes `phone`, `phone_verified_at`, `kyc_document_url`, `bio_violation_count`, `bio_cooldown_until`, `tier`. `kyc_verified_at` is exposed only as a boolean (`is_kyc_verified`) — the timestamp is internal.

RLS on the view allows any authenticated user to SELECT any row:

```sql
CREATE POLICY public_users_select ON public_users
  FOR SELECT TO authenticated
  USING (true);
```

### Why a View, Not a Separate Table

A separate `public_profiles` table would require keeping it in sync with `profiles` via triggers or application code — synchronization drift is a common bug source. A view is always derived from the live `profiles` data; there is no sync problem.

### Why Not Just RLS Column Grants

PostgreSQL column-level GRANT (`GRANT SELECT (col1, col2) ON profiles TO anon`) would work for the anon role but Supabase's PostgREST setup makes column grants harder to reason about across roles. A view with an explicit column list is more readable, testable (just query the view), and role-agnostic.

### "Verified Contributor" Badge

Frontend code checks `public_users.is_kyc_verified` to render the badge. No raw timestamp is exposed; the badge is purely boolean. This satisfies the spec requirement while hiding the approval date.

---

## Scope

- **Migration**: `public_users` view definition; RLS policy on the view; revoke direct `SELECT` on `profiles` from `anon` role (anon users should not query profiles at all).
- **All public-facing queries** (recommendation posts, vendor pages, affiliate displays): must query `public_users`, not `profiles` directly.
- **Own-profile queries** (settings page, verification wizard): continue to query `profiles` directly — the user sees their own full row.
- **Admin routes**: use `createServiceClient()` which bypasses RLS and queries `profiles` directly.
