CREATE TABLE public.support_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surface text NOT NULL CHECK (surface IN ('handoff', 'ticket_create', 'ticket_reply')),
  target text NOT NULL CHECK (length(target) BETWEEN 1 AND 64),
  subject text NOT NULL DEFAULT '' CHECK (length(subject) <= 255),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, surface, target)
);

ALTER TABLE public.support_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_drafts TO service_role;

CREATE OR REPLACE FUNCTION public.save_support_draft(
  p_owner_id uuid,
  p_surface text,
  p_target text,
  p_subject text,
  p_body text,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_draft public.support_drafts%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'support_ticket_service_role_required';
  END IF;
  IF p_owner_id IS NULL OR p_surface NOT IN ('handoff', 'ticket_create', 'ticket_reply')
     OR p_target IS NULL OR length(p_target) NOT BETWEEN 1 AND 64
     OR p_subject IS NULL OR length(p_subject) > 255
     OR p_body IS NULL OR length(p_body) > 2000
     OR p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'support_draft_invalid';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_owner_id::text || ':' || p_surface || ':' || p_target, 0));
  SELECT * INTO v_draft FROM public.support_drafts
   WHERE owner_id = p_owner_id AND surface = p_surface AND target = p_target FOR UPDATE;
  IF NOT FOUND THEN
    IF p_expected_version <> 0 THEN RAISE EXCEPTION USING MESSAGE = 'support_draft_version_conflict'; END IF;
    INSERT INTO public.support_drafts (owner_id, surface, target, subject, body)
    VALUES (p_owner_id, p_surface, p_target, p_subject, p_body)
    RETURNING * INTO v_draft;
    RETURN jsonb_build_object('version', v_draft.version, 'changed', true);
  END IF;
  IF v_draft.subject = p_subject AND v_draft.body = p_body THEN
    RETURN jsonb_build_object('version', v_draft.version, 'changed', false);
  END IF;
  IF v_draft.version <> p_expected_version THEN
    RAISE EXCEPTION USING MESSAGE = 'support_draft_version_conflict';
  END IF;

  UPDATE public.support_drafts
     SET subject = p_subject, body = p_body, version = version + 1, updated_at = now()
   WHERE id = v_draft.id
   RETURNING * INTO v_draft;
  RETURN jsonb_build_object('version', v_draft.version, 'changed', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_support_draft(uuid, text, text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_support_draft(uuid, text, text, text, text, integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
