-- Align drifted environments with the numeric preference-radius contract.

BEGIN;

ALTER TABLE public.preference_survey_responses
  DROP COLUMN IF EXISTS preferred_distance;

COMMIT;
