# ADR-031: Preference Survey — Consumer Contract & Tier Promotion

**Status:** Accepted  
**PR:** 031 — `031_preference_survey.sql`

---

## Context

The preference survey is a one-time onboarding quiz that feeds the AI discovery engine (Member 2's domain). It must also trigger tier advancement for Member 3's `profile_complete` gate — but only if phone verification and full profile fields are already complete. Two questions had to be resolved before implementation:

1. How does survey submission advance the user's tier without Member 3 and Member 2 coupling directly?
2. What is the minimal schema contract so both members can build in parallel?

---

## Decisions

### Atomic RPC — `complete_preference_survey`

Survey submission does two things that must succeed or fail together:

1. Insert the user's answers into `preference_survey_responses`.
2. Call `promote_to_profile_complete(p_user_id)` if all other completion criteria are met.

These are wrapped in a single SECURITY DEFINER RPC:

```sql
CREATE OR REPLACE FUNCTION complete_preference_survey(
  p_user_id UUID,
  p_interests TEXT[],
  p_travel_style TEXT,
  p_budget_range TEXT,
  p_mobility_needs TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO preference_survey_responses (...)
  VALUES (...);

  -- Idempotent: only promote if not already at or past this tier
  PERFORM promote_to_profile_complete(p_user_id);
EXCEPTION
  WHEN unique_violation THEN NULL; -- survey already submitted, ignore
END;
$$;
```

The EXCEPTION block makes re-submission idempotent — a user who accidentally submits twice does not get an error, and does not get a duplicate row.

### Four Core Questions (Minimum Contract)

The survey schema is agreed between Member 2 (AI discovery consumer) and Member 3 (tier gate):

| Column | Type | Values |
|---|---|---|
| `interests` | `TEXT[]` | e.g. `['nature', 'food', 'heritage']` |
| `travel_style` | `TEXT` | `solo`, `couple`, `family`, `group` |
| `budget_range` | `TEXT` | `budget`, `mid_range`, `luxury` |
| `mobility_needs` | `TEXT` | `none`, `limited`, `wheelchair` |

Member 2 may add more columns later without changing the contract — the RPC only requires these four. Additional columns default to `NULL` if not supplied.

### Tier Advancement Criteria

`promote_to_profile_complete` checks all four criteria atomically:

1. `profiles.full_name IS NOT NULL AND profiles.full_name != ''`
2. `profiles.city IS NOT NULL`
3. `profiles.avatar_url IS NOT NULL`
4. `profiles.bio IS NOT NULL`
5. Survey row exists for this user (`EXISTS (SELECT 1 FROM preference_survey_responses WHERE user_id = p_user_id)`)

The survey is criterion #5. All five must be true. If the user skips the survey and fills everything else, they cannot reach `profile_complete` — the survey is mandatory.

### Survey Is One-Time

`preference_survey_responses` has a UNIQUE constraint on `user_id`. Re-submission is silently ignored (EXCEPTION block above). A separate `PUT /api/profile/survey/update` route exists for users who want to update preferences later — this route does not re-trigger tier promotion.

### Why Not a Trigger

A trigger on `preference_survey_responses` INSERT that automatically promotes the tier would be simpler but:
- Silent — hard to trace why a tier changed
- Cannot be unit-tested without inserting rows
- Couples Member 2's table to Member 3's tier logic invisibly

The RPC call from the route is explicit, logged, and testable.

---

## Scope

- **Migration**: `preference_survey_responses` table; UNIQUE index on `user_id`; `complete_preference_survey` RPC; updated `promote_to_profile_complete` to include survey check.
- **`app/api/profile/survey/route.ts`**: POST calls `complete_preference_survey` RPC; PUT updates individual preferences (no tier effect).
- **`lib/validation/profile-schemas.ts`**: `preferenceSurveySchema` added.
- **Member 2 dependency**: Member 2's AI discovery reads `preference_survey_responses` directly — no API contract between members, just a shared table. Schema changes to additional columns must be coordinated.
