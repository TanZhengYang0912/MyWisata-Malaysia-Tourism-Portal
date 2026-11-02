# ADR-031: Preference Survey — Personalization Contract

**Status:** Accepted  
**PR:** 031 — `031_preference_survey.sql`

---

## Context

The preference survey feeds personalized recommendations. It does not contribute to Profile completion or promote a verification tier. Profile completion uses only the five core fields: full name, photo, short bio, city, and country.

---

## Decisions

### Survey RPC — `complete_preference_survey`

Survey submission stores the user's preference answers. The SECURITY DEFINER RPC does not call Profile promotion:

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

  -- Upsert existing answers; verification tier remains unchanged.
END;
$$;
```


### Personalization Questions

The survey schema is the personalization input contract:

| Column | Type | Values |
|---|---|---|
| `interests` | `TEXT[]` | e.g. `['nature', 'food', 'heritage']` |
| `travel_style` | `TEXT` | `solo`, `couple`, `family`, `group` |
| `budget_range` | `TEXT` | `budget`, `mid_range`, `luxury` |
| `mobility_needs` | `TEXT` | `none`, `limited`, `wheelchair` |

The existing survey also stores budget, mobility, radius, pet-friendly, and notes preferences.

### Profile Completion

`profile_completion_eligible` checks the five core fields:

1. `profiles.full_name IS NOT NULL AND profiles.full_name != ''`
2. `profiles.city IS NOT NULL`
3. `profiles.avatar_url IS NOT NULL`
4. `profiles.bio IS NOT NULL`
5. A valid short bio (existing completed profiles retain their previously accepted bio length)

The survey is not a criterion. A customer who skips it can complete Profile and use the capabilities allowed by their other verified facts. Personalized recommendations become available after survey answers are saved.

### Survey Can Be Updated

`preference_survey_responses` has a UNIQUE constraint on `user_id`; the RPC upserts the row. Both POST and PUT save Travel Style and do not change Profile status.

---

## Scope

- **Migration**: restore `preference_survey_responses.travel_style`; keep the old seven-argument `complete_preference_survey` signature for existing clients; ensure survey saves do not promote Profile.
- **`app/api/profile/survey/route.ts`**: POST calls `complete_preference_survey` RPC; PUT updates individual preferences (no tier effect).
- **`lib/validation/profile-schemas.ts`**: `preferenceSurveySchema` added.
- **Member 2 dependency**: Member 2's AI discovery reads `preference_survey_responses` directly — no API contract between members, just a shared table. Schema changes to additional columns must be coordinated.
