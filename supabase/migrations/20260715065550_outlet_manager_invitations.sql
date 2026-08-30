-- Outlet manager invitations
-- One primary manager per outlet and one outlet per manager remain enforced by
-- the unique indexes created in 009_outlet_manager_one_to_one.sql.

CREATE TABLE IF NOT EXISTS public.outlet_manager_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  outlet_id     UUID NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  invited_email VARCHAR(255) NOT NULL,
  invited_by    UUID NOT NULL REFERENCES public.users(id),
  token_hash    TEXT NOT NULL UNIQUE,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_by   UUID REFERENCES public.users(id),
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT outlet_manager_invitation_email_not_blank CHECK (length(trim(invited_email)) > 3),
  CONSTRAINT outlet_manager_invitation_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS outlet_manager_invitations_email_idx
  ON public.outlet_manager_invitations (lower(invited_email), status);

CREATE UNIQUE INDEX IF NOT EXISTS outlet_manager_invitations_one_pending_per_outlet
  ON public.outlet_manager_invitations (outlet_id)
  WHERE status = 'pending';

ALTER TABLE public.outlet_manager_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outlet_manager_invitations_owner_read ON public.outlet_manager_invitations;
CREATE POLICY outlet_manager_invitations_owner_read ON public.outlet_manager_invitations
  FOR SELECT USING (invited_by = auth.uid() OR accepted_by = auth.uid() OR is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.accept_outlet_manager_invitation(p_token_hash TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_user_email   TEXT;
  v_invitation   public.outlet_manager_invitations%ROWTYPE;
  v_role_id      INTEGER;
  v_vendor_ok    BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_invitation
  FROM public.outlet_manager_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invitation';
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'invitation_not_pending';
  END IF;
  IF v_invitation.expires_at <= NOW() THEN
    UPDATE public.outlet_manager_invitations SET status = 'expired' WHERE id = v_invitation.id;
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  SELECT email INTO v_user_email FROM public.users WHERE id = v_user_id;
  IF v_user_email IS NULL OR lower(trim(v_user_email)) <> lower(trim(v_invitation.invited_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.outlets o
    JOIN public.vendors v ON v.id = o.vendor_id
    WHERE o.id = v_invitation.outlet_id
      AND o.vendor_id = v_invitation.vendor_id
      AND v.status = 'approved'
  ) INTO v_vendor_ok;
  IF NOT v_vendor_ok THEN
    RAISE EXCEPTION 'vendor_or_outlet_unavailable';
  END IF;

  IF EXISTS (SELECT 1 FROM public.outlet_managers WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'manager_already_assigned';
  END IF;
  IF EXISTS (SELECT 1 FROM public.outlet_managers WHERE outlet_id = v_invitation.outlet_id) THEN
    RAISE EXCEPTION 'outlet_already_assigned';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = 'outlet_manager';
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'outlet_manager_role_missing';
  END IF;

  INSERT INTO public.outlet_managers (user_id, outlet_id)
  VALUES (v_user_id, v_invitation.outlet_id);

  INSERT INTO public.user_roles (user_id, role_id, vendor_id, outlet_id)
  VALUES (v_user_id, v_role_id, v_invitation.vendor_id, v_invitation.outlet_id)
  ON CONFLICT DO NOTHING;

  UPDATE public.outlet_manager_invitations
  SET status = 'accepted', accepted_by = v_user_id, accepted_at = NOW()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'invitation_id', v_invitation.id,
    'vendor_id', v_invitation.vendor_id,
    'outlet_id', v_invitation.outlet_id,
    'user_id', v_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_outlet_manager_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_outlet_manager_invitation(TEXT) TO authenticated;
;
