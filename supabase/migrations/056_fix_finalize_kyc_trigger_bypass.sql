-- finalize_kyc_submission calls UPDATE users SET kyc_status = 'pending', which is
-- protected by the protect_verification_fields trigger introduced in migration
-- 20260715000030.  The trigger allows writes when app.allow_verification_write = 'on'
-- or the caller is an admin.  Regular users calling finalize_kyc_submission are
-- neither, so the UPDATE was blocked.  Add the same set_config bypass that all
-- other promote_* functions already use.

CREATE OR REPLACE FUNCTION finalize_kyc_submission(
  p_submission_id UUID, p_front_path TEXT, p_back_path TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_pos INT; v_prefix TEXT; v_front_mime TEXT; v_back_mime TEXT; v_front_token TEXT; v_back_token TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  PERFORM 1 FROM kyc_submissions WHERE id = p_submission_id AND user_id = auth.uid() AND status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  v_prefix := auth.uid()::text || '/' || p_submission_id::text || '/';
  SELECT (regexp_match(p_front_path, '^' || v_prefix || '([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/front\.(jpg|jpeg|png|pdf)$'))[1] INTO v_front_token;
  SELECT (regexp_match(p_back_path,  '^' || v_prefix || '([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/back\.(jpg|jpeg|png|pdf)$'))[1]  INTO v_back_token;
  IF p_front_path = p_back_path OR v_front_token IS NULL OR v_back_token IS NULL OR v_front_token <> v_back_token THEN
    RAISE EXCEPTION 'invalid_document_path';
  END IF;
  SELECT COALESCE(metadata->>'mimetype', CASE WHEN name ~* '\.pdf$' THEN 'application/pdf' WHEN name ~* '\.png$' THEN 'image/png' ELSE 'image/jpeg' END)
    INTO v_front_mime FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = p_front_path;
  SELECT COALESCE(metadata->>'mimetype', CASE WHEN name ~* '\.pdf$' THEN 'application/pdf' WHEN name ~* '\.png$' THEN 'image/png' ELSE 'image/jpeg' END)
    INTO v_back_mime FROM storage.objects WHERE bucket_id = 'kyc-documents' AND name = p_back_path;
  IF v_front_mime IS NULL OR v_back_mime IS NULL THEN RAISE EXCEPTION 'documents_missing'; END IF;
  IF v_front_mime NOT IN ('image/jpeg', 'image/png', 'application/pdf') OR v_back_mime NOT IN ('image/jpeg', 'image/png', 'application/pdf') THEN
    RAISE EXCEPTION 'invalid_document_mime';
  END IF;
  INSERT INTO kyc_submission_documents (submission_id, side, storage_path, mime_type)
  VALUES (p_submission_id, 'front', p_front_path, v_front_mime), (p_submission_id, 'back', p_back_path, v_back_mime);
  SELECT COALESCE(MAX(queue_position), 0) + 1 INTO v_pos FROM kyc_submissions WHERE status = 'pending';
  UPDATE kyc_submissions SET status = 'pending', queue_position = v_pos WHERE id = p_submission_id;
  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE users SET kyc_status = 'pending', updated_at = now() WHERE id = auth.uid();
  RETURN p_submission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_kyc_submission(UUID, TEXT, TEXT) TO authenticated;
