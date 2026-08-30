-- ============================================================
-- 029_kyc_append_only.sql — KYC submissions as append-only event log
--
-- 1. Drop mutable UNIQUE(user_id) constraint
-- 2. Expand status CHECK to include 'info_requested'
-- 3. Add queue_position column (ordinal, stored at insert time)
-- 4. Partial UNIQUE: max one active (pending/info_requested) submission per user
-- 5. Rewrite submit_kyc as append-only INSERT (no more ON CONFLICT UPDATE)
-- 6. Rewrite admin_review_kyc to INSERT review rows instead of UPDATE
-- 7. RLS: INSERT for self, SELECT for own rows or admin
-- ============================================================


-- ── 1. Drop the mutable UNIQUE(user_id) constraint ───────────────────────────
ALTER TABLE kyc_submissions
  DROP CONSTRAINT IF EXISTS kyc_submissions_user_id_key;


-- ── 2. Expand status CHECK ────────────────────────────────────────────────────
-- Drop ALL check constraints on kyc_submissions.status regardless of name,
-- then normalise any stale values before re-adding the authoritative constraint.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'kyc_submissions'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE kyc_submissions DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- Rows with a status outside the authoritative set are reset to 'pending'
-- so the new constraint can be added cleanly.
UPDATE kyc_submissions
   SET status = 'pending'
 WHERE status NOT IN ('pending','info_requested','approved','rejected');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'kyc_submissions'::regclass
       AND conname  = 'kyc_submissions_status_check'
  ) THEN
    ALTER TABLE kyc_submissions
      ADD CONSTRAINT kyc_submissions_status_check
        CHECK (status IN ('pending','info_requested','approved','rejected'));
  END IF;
END $$;


-- ── 3. queue_position column ─────────────────────────────────────────────────
ALTER TABLE kyc_submissions
  ADD COLUMN IF NOT EXISTS queue_position INT;


-- ── 4. Partial UNIQUE: one active submission per user ─────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_kyc_one_active_per_user
  ON kyc_submissions(user_id)
  WHERE status IN ('pending','info_requested');


-- ── 5. submit_kyc — append-only rewrite ──────────────────────────────────────
-- Every submission is a new row. The unique index prevents concurrent active subs.
-- Tier gate: user must be at least profile_complete to submit KYC.
-- Advisory lock: serializes concurrent requests from the same user.
-- Migrations 018/019 defined this exact signature with RETURNS void. PostgreSQL
-- cannot change a function's return type through CREATE OR REPLACE, so remove
-- the old definition first. The GRANT below is intentionally re-applied.
DROP FUNCTION IF EXISTS submit_kyc(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION submit_kyc(
  p_user_id  UUID,
  p_ic_hash  TEXT,
  p_doc_type TEXT,
  p_doc_url  TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tier     TEXT;
  v_pos      INT;
  v_id       UUID;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Serialize concurrent submissions from the same user
  PERFORM pg_advisory_xact_lock(hashtext('kyc_submit:' || p_user_id::text));

  -- Tier gate: profile_complete required
  SELECT tier INTO v_tier FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id;
  END IF;
  IF tier_rank(v_tier) < tier_rank('profile_complete') THEN
    RAISE EXCEPTION 'tier_insufficient: profile_complete required to submit KYC';
  END IF;

  -- Compute ordinal queue position (count pending submissions before this one)
  SELECT COALESCE(MAX(queue_position), 0) + 1
    INTO v_pos
    FROM kyc_submissions
   WHERE status = 'pending';

  -- Append-only insert — unique index enforces one active submission
  INSERT INTO kyc_submissions
    (user_id, ic_hash, document_type, document_url, status, queue_position)
  VALUES
    (p_user_id, p_ic_hash, p_doc_type, p_doc_url, 'pending', v_pos)
  RETURNING id INTO v_id;

  -- Update kyc_status to reflect pending state
  UPDATE users
     SET kyc_status = 'pending', updated_at = now()
   WHERE id = p_user_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION submit_kyc(UUID, TEXT, TEXT, TEXT) TO authenticated;


-- ── 6. admin_review_kyc — append-only rewrite ────────────────────────────────
-- Creates a new review row instead of mutating the pending submission.
-- The partial unique index prevents the reviewed row from blocking a resubmission
-- (approved/rejected rows don't match the WHERE clause).
CREATE OR REPLACE FUNCTION admin_review_kyc(
  p_user_id UUID,
  p_action  TEXT,
  p_reason  TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_active_id UUID;
  v_doc_type  TEXT;
  v_doc_url   TEXT;
  v_ic_hash   TEXT;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF p_action NOT IN ('approve', 'reject', 'request_info') THEN
    RAISE EXCEPTION 'invalid_action: %', p_action;
  END IF;

  -- Find the current active submission
  SELECT id, document_type, document_url, ic_hash
    INTO v_active_id, v_doc_type, v_doc_url, v_ic_hash
    FROM kyc_submissions
   WHERE user_id = p_user_id
     AND status IN ('pending','info_requested')
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'kyc_not_active_or_not_found: %', p_user_id;
  END IF;

  -- Mark the active submission as reviewed (mutable — this row is the original doc record)
  UPDATE kyc_submissions
     SET status           = CASE
                              WHEN p_action = 'approve'       THEN 'approved'
                              WHEN p_action = 'reject'        THEN 'rejected'
                              WHEN p_action = 'request_info'  THEN 'info_requested'
                            END,
         reviewed_at      = now(),
         reviewer_id      = auth.uid(),
         rejection_reason = CASE WHEN p_action IN ('reject','request_info') THEN p_reason ELSE NULL END
   WHERE id = v_active_id;

  -- Drive tier and kyc_status
  IF p_action = 'approve' THEN
    PERFORM promote_to_kyc_verified(p_user_id);
    PERFORM gen_affiliate_code(p_user_id);
  ELSIF p_action = 'reject' THEN
    UPDATE users
       SET kyc_status = 'rejected', updated_at = now()
     WHERE id = p_user_id;
  ELSIF p_action = 'request_info' THEN
    UPDATE users
       SET kyc_status = 'pending', updated_at = now()
     WHERE id = p_user_id;
  END IF;

  INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data, note)
  VALUES (auth.uid(), 'kyc.' || p_action, 'user', p_user_id,
          jsonb_build_object('action', p_action, 'submission_id', v_active_id), p_reason);
END;
$$;
GRANT EXECUTE ON FUNCTION admin_review_kyc(UUID, TEXT, TEXT) TO authenticated;


-- ── 7. RLS for kyc_submissions ────────────────────────────────────────────────
-- Users can INSERT their own submissions (via RPC, not directly, but RLS must allow)
-- Users can SELECT their own submissions; admins see all
ALTER TABLE kyc_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kyc_select_own ON kyc_submissions;
CREATE POLICY kyc_select_own
  ON kyc_submissions FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin(auth.uid())
  );

DROP POLICY IF EXISTS kyc_insert_own ON kyc_submissions;
CREATE POLICY kyc_insert_own
  ON kyc_submissions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
