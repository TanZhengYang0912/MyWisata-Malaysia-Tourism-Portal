-- ============================================================
-- 032_submit_kyc_resubmit.sql — Allow re-submission after info_requested
--
-- The partial UNIQUE index in 029 (status IN ('pending','info_requested'))
-- blocks a second INSERT while an info_requested row exists.
-- Fix: before inserting, close any info_requested row by marking it rejected,
-- so the unique slot is freed for the new pending submission.
-- ============================================================

CREATE OR REPLACE FUNCTION submit_kyc(
  p_user_id  UUID,
  p_ic_hash  TEXT,
  p_doc_type TEXT,
  p_doc_url  TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tier TEXT;
  v_pos  INT;
  v_id   UUID;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('kyc_submit:' || p_user_id::text));

  SELECT tier INTO v_tier FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id;
  END IF;
  IF tier_rank(v_tier) < tier_rank('profile_complete') THEN
    RAISE EXCEPTION 'tier_insufficient: profile_complete required to submit KYC';
  END IF;

  -- Close any info_requested submission so the unique slot is free for re-submission
  UPDATE kyc_submissions
     SET status = 'rejected', updated_at = now()
   WHERE user_id = p_user_id
     AND status = 'info_requested';

  SELECT COALESCE(MAX(queue_position), 0) + 1
    INTO v_pos
    FROM kyc_submissions
   WHERE status = 'pending';

  INSERT INTO kyc_submissions
    (user_id, ic_hash, document_type, document_url, status, queue_position)
  VALUES
    (p_user_id, p_ic_hash, p_doc_type, p_doc_url, 'pending', v_pos)
  RETURNING id INTO v_id;

  UPDATE users
     SET kyc_status = 'pending', updated_at = now()
   WHERE id = p_user_id;

  RETURN v_id;
END;
$$;
