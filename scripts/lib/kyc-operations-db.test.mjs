import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const runtimeRoot = path.resolve(process.env.KYC_EMBEDDED_PG_RUNTIME ?? process.argv[2] ?? '/tmp/mywisata-kyc-pg-runtime');
if (runtimeRoot.startsWith('http:') || runtimeRoot.startsWith('https:')) throw new Error('Only a local embedded-postgres runtime path is accepted');
const { default: EmbeddedPostgres } = await import(pathToFileURL(path.join(runtimeRoot, 'node_modules/embedded-postgres/dist/index.js')).href);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = await fs.readFile(path.join(repo, 'supabase/migrations/20261015192354_kyc_prescreening_operations.sql'), 'utf8');
const identityMigration = await fs.readFile(path.join(repo, 'supabase/migrations/20261102095746_kyc_identity_uniqueness.sql'), 'utf8');
const privateDraftMigration = await fs.readFile(path.join(repo, 'supabase/migrations/20261102095748_kyc_private_draft_operations.sql'), 'utf8');
const dbDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mywisata-kyc-pg-'));
const port = 55439;
const pg = new EmbeddedPostgres({ databaseDir: dbDir, user: 'postgres', password: 'postgres', port, persistent: false, onLog: () => {}, onError: () => {} });
const clients = new Set();
const reviewer1 = '11111111-1111-4111-8111-111111111111';
const reviewer2 = '22222222-2222-4222-8222-222222222222';
const reviewer3 = '33333333-3333-4333-8333-333333333333';
const service = '44444444-4444-4444-8444-444444444444';
const withdrawOwner = '66666666-6666-4666-8666-666666666666';
const withdrawPreviousCase = '77777777-7777-4777-8777-777777777777';

function ok(label, value = '') { console.log(`PASS ${label}${value ? `: ${value}` : ''}`); }
function fail(label, error) { console.error(`FAIL ${label}: ${error?.message ?? error}${error?.position ? ` (SQL position ${error.position})` : ''}`); process.exitCode = 1; }
async function client(database = 'postgres') {
  const c = pg.getPgClient(database, '127.0.0.1');
  await c.connect();
  clients.add(c);
  return c;
}
async function closeClient(c) { clients.delete(c); await c.end(); }
async function sql(c, text, params = []) { return c.query(text, params); }
async function claims(c, { sub = service, role = 'service_role', aal = 'aal2', sessionId, permitted = 'true', superAdmin = false } = {}) {
  const jwtClaims = { sub, role, aal, ...(sessionId ? { session_id: sessionId } : {}) };
  await sql(c, `SELECT set_config('request.jwt.claims', $1, false), set_config('request.kyc.permitted', $2, false), set_config('request.kyc.super_admin', $3, false)`, [JSON.stringify(jwtClaims), permitted, String(superAdmin)]);
  if (!['authenticated', 'service_role'].includes(role)) throw new Error(`unexpected test role ${role}`);
  await sql(c, `SET ROLE ${role}`);
}
function uuid() { return crypto.randomUUID(); }
function hmac() { return 'a'.repeat(64); }

const schema = String.raw`
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA auth;
CREATE SCHEMA app_private;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
GRANT USAGE ON SCHEMA auth, app_private TO anon, authenticated, service_role;
CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), not_after timestamptz);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(auth.jwt()->>'role','') $$;
CREATE TABLE public.users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, full_name text, phone text, tier text NOT NULL DEFAULT 'profile_complete',
 kyc_status text NOT NULL DEFAULT 'unverified', status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), email_verified_at timestamptz, phone_verified_at timestamptz,
 profile_completed_at timestamptz, stripe_payouts_enabled boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO service_role;
CREATE TABLE public.roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE);
CREATE TABLE public.user_roles (user_id uuid NOT NULL REFERENCES public.users(id), role_id uuid NOT NULL REFERENCES public.roles(id), vendor_id uuid, outlet_id uuid);
INSERT INTO public.roles(id,name) VALUES ('aaaaaaaa-0000-4000-8000-000000000001','admin'),('aaaaaaaa-0000-4000-8000-000000000002','super_admin');
CREATE TABLE public.staff_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, module text NOT NULL DEFAULT 'admin', action text NOT NULL DEFAULT 'test', description text NOT NULL DEFAULT 'test', is_system boolean NOT NULL DEFAULT true);
CREATE TABLE public.staff_modules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.staff_module_permissions (module_id uuid NOT NULL, permission_id uuid NOT NULL);
CREATE TABLE public.staff_module_legacy_roles (role_name text NOT NULL, grants_permissions boolean NOT NULL DEFAULT true);
CREATE TABLE public.staff_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.staff_role_permissions (role_id uuid NOT NULL, permission_id uuid NOT NULL, PRIMARY KEY(role_id,permission_id));
CREATE TABLE public.staff_role_assignments (user_id uuid NOT NULL, role_id uuid NOT NULL, revoked_at timestamptz);
CREATE TABLE public.staff_role_modules (role_id uuid NOT NULL, module_id uuid NOT NULL);
INSERT INTO public.staff_permissions(id,key) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin.kyc.review');
INSERT INTO public.staff_modules(id,is_active) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
INSERT INTO public.staff_module_permissions(module_id,permission_id) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.staff_module_legacy_roles(role_name,grants_permissions) VALUES ('admin',true);
CREATE TABLE public.notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, type text NOT NULL, title text NOT NULL, body text NOT NULL, link text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.kyc_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id), document_type text NOT NULL DEFAULT 'national_id',
 document_url text, status text NOT NULL DEFAULT 'pending', reviewer_id uuid REFERENCES public.users(id), rejection_reason text, reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), queue_position integer, ic_hash text, ic_hash_version text NOT NULL DEFAULT 'hmac_sha256_v1', legacy_single_document boolean NOT NULL DEFAULT false,
 review_reason_code text, review_reason_detail text, evidence_retention_started_at timestamptz, ocr_consent_at timestamptz,
 legal_name_snapshot text, email_snapshot text, phone_snapshot text, identity_snapshot_captured_at timestamptz,
 assigned_to uuid REFERENCES public.users(id), claimed_at timestamptz,
 CONSTRAINT kyc_status_ck CHECK (status IN ('draft','pending','info_requested','approved','rejected','superseded'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kyc_submissions TO service_role;
CREATE TABLE public.kyc_submission_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES public.kyc_submissions(id) ON DELETE CASCADE,
 side text NOT NULL CHECK (side IN ('front','back')), storage_path text NOT NULL UNIQUE,
 mime_type text NOT NULL DEFAULT 'image/jpeg', created_at timestamptz NOT NULL DEFAULT now(), purge_claimed_at timestamptz,
 UNIQUE (submission_id, side)
);
CREATE TABLE public.kyc_ocr_results (
 submission_id uuid PRIMARY KEY REFERENCES public.kyc_submissions(id) ON DELETE RESTRICT, status text NOT NULL,
 holder_name text, document_number_hmac text, document_number_last4 text, expiry_date date, confidence numeric,
 mismatch_fields text[] NOT NULL DEFAULT '{}', provider_model text NOT NULL, processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.kyc_review_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES public.kyc_submissions(id), user_id uuid NOT NULL REFERENCES public.users(id),
 from_status text NOT NULL, to_status text NOT NULL, action text NOT NULL, actor_id uuid REFERENCES public.users(id), actor_role text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), reason_category text, internal_note text, customer_message text
);
CREATE TABLE public.audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES public.users(id), action text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL,
 before_data jsonb, after_data jsonb, note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE app_private.portal_workload_slots (
 scope text NOT NULL CHECK (scope IN ('kyc_upload','recommendation_upload','trip_ai')),
 token uuid NOT NULL, expires_at timestamptz NOT NULL, PRIMARY KEY(scope,token)
);
ALTER TABLE app_private.portal_workload_slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.portal_workload_slots FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.can_review_kyc(p_actor_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT p_actor_id IS NOT NULL $$;
CREATE OR REPLACE FUNCTION app_private.check_kyc_document_access(p_actor_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_actor_id IS NULL THEN RAISE EXCEPTION 'admin_required'; END IF; END; $$;
CREATE OR REPLACE FUNCTION public.recompute_compatibility_tier(p_user_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_tier text;
BEGIN
 SELECT CASE WHEN email_verified_at IS NULL THEN 'email_unverified'
   WHEN phone_verified_at IS NOT NULL AND profile_completed_at IS NOT NULL AND kyc_status='approved' THEN 'kyc_verified'
   WHEN phone_verified_at IS NOT NULL AND profile_completed_at IS NOT NULL THEN 'profile_complete'
   WHEN phone_verified_at IS NOT NULL THEN 'phone_verified' ELSE 'email_verified' END
 INTO v_tier FROM public.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
 UPDATE public.users SET tier=v_tier,updated_at=now() WHERE id=p_user_id;
END; $$;
CREATE OR REPLACE FUNCTION app_private.require_kyc_aal2() RETURNS void LANGUAGE plpgsql STABLE AS $$
BEGIN IF coalesce(auth.jwt()->>'aal','') <> 'aal2' THEN RAISE EXCEPTION 'aal2_required'; END IF; END; $$;
CREATE OR REPLACE FUNCTION public.has_staff_permission(p_user uuid, p_permission text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(current_setting('request.kyc.permitted', true),'false')='true' AND p_user IS NOT NULL AND p_permission='admin.kyc.review' $$;
CREATE OR REPLACE FUNCTION public.begin_kyc_submission(p_user_id uuid,p_ic_hash text,p_ic_hash_version text,p_doc_type text,p_ocr_consent boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.role()<>'service_role' OR NOT p_ocr_consent THEN RAISE EXCEPTION 'service_role_required'; END IF;
 INSERT INTO public.kyc_submissions(user_id,ic_hash,ic_hash_version,document_type,status,legal_name_snapshot,email_snapshot,identity_snapshot_captured_at,ocr_consent_at)
 SELECT p_user_id,p_ic_hash,p_ic_hash_version,p_doc_type,'draft',full_name,email,now(),now() FROM public.users WHERE id=p_user_id
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
 RETURN v_id;
END; $$;
CREATE FUNCTION public.review_kyc(uuid,uuid,character varying,text) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
CREATE FUNCTION app_private.review_kyc(uuid,uuid,character varying,text) RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
CREATE OR REPLACE FUNCTION app_private.admin_review_kyc(p_submission_id uuid,p_user_id uuid,p_action text,p_reason_code text,p_reason_detail text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_status text;
BEGIN SELECT status INTO old_status FROM public.kyc_submissions WHERE id=p_submission_id FOR UPDATE;
 IF old_status IS NULL THEN RAISE EXCEPTION 'kyc_not_found'; END IF;
 UPDATE public.kyc_submissions SET status=CASE p_action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'info_requested' END,
  review_reason_code=p_reason_code, review_reason_detail=p_reason_detail, reviewed_at=now() WHERE id=p_submission_id;
 INSERT INTO public.kyc_review_events(submission_id,user_id,from_status,to_status,action,actor_id,actor_role)
  VALUES(p_submission_id,p_user_id,old_status,CASE p_action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'info_requested' END,p_action,auth.uid(),'reviewer');
END; $$;
CREATE OR REPLACE FUNCTION public.admin_review_kyc(p_submission_id uuid,p_user_id uuid,p_action text,p_reason_code text,p_reason_detail text) RETURNS void
LANGUAGE sql SECURITY INVOKER AS $$ SELECT app_private.admin_review_kyc($1,$2,$3,$4,$5) $$;
CREATE OR REPLACE FUNCTION public.record_kyc_ocr_result(
 p_submission_id uuid,p_status text,p_holder_name text,p_document_number_hmac text,p_document_number_last4 text,
 p_expiry_date date,p_confidence numeric,p_mismatch_fields text[],p_provider_model text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
 INSERT INTO public.kyc_ocr_results(submission_id,status,holder_name,document_number_hmac,document_number_last4,expiry_date,confidence,mismatch_fields,provider_model)
 VALUES($1,$2,NULLIF(btrim($3),''),$4,$5,$6,$7,coalesce($8,'{}'),$9)
 ON CONFLICT(submission_id) DO UPDATE SET status=excluded.status,holder_name=excluded.holder_name,document_number_hmac=excluded.document_number_hmac,
 document_number_last4=excluded.document_number_last4,expiry_date=excluded.expiry_date,confidence=excluded.confidence,mismatch_fields=excluded.mismatch_fields,provider_model=excluded.provider_model,processed_at=now();
END; $$;
`;

try {
  // npm install was intentionally run with lifecycle scripts disabled; recreate
  // the package's disposable dylib aliases under /tmp only.
  const nativeRoot = path.join(runtimeRoot, 'node_modules/@embedded-postgres/darwin-arm64/native');
  const aliases = JSON.parse(await fs.readFile(path.join(nativeRoot, 'pg-symlinks.json'), 'utf8'))
    .reduce((out, item) => { out[path.basename(item.target)] = path.basename(item.source); return out; }, {});
  for (const [alias, target] of Object.entries(aliases)) {
    try { await fs.symlink(target, path.join(nativeRoot, 'lib', alias)); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  await pg.initialise();
  await pg.start();
  const admin = await client();
  await sql(admin, schema);
  try {
    await sql(admin, await fs.readFile(path.join(repo, 'supabase/migrations/20261012154530_kyc_reviewer_mfa_boundaries.sql'), 'utf8'));
    await sql(admin, migration);
    await sql(admin, await fs.readFile(path.join(repo, 'supabase/migrations/20261016124312_kyc_prescreening_failure_policy.sql'), 'utf8'));
    await sql(admin, await fs.readFile(path.join(repo, 'supabase/migrations/20261021041200_kyc_ocr_engine_provenance.sql'), 'utf8'));
    await sql(admin, `INSERT INTO public.users(id,email,full_name,kyc_status) VALUES ($1,$2,'Previously Verified','approved')`, [withdrawOwner, `${withdrawOwner}@example.test`]);
    await sql(admin, `INSERT INTO public.kyc_submissions(id,user_id,status,legal_name_snapshot,email_snapshot)
      VALUES ($1,$2,'approved','Previously Verified',$3)`, [withdrawPreviousCase, withdrawOwner, `${withdrawOwner}@example.test`]);
    await sql(admin, identityMigration);
    await sql(admin, `UPDATE app_private.kyc_identity_control SET confirmation_ttl_seconds=60 WHERE singleton`);
    await sql(admin, privateDraftMigration);
    ok('identity migration applies to isolated PostgreSQL');
  } catch (e) {
    fail('migration applies to isolated PostgreSQL', e);
    throw e;
  }

  const draftOwner = uuid();
  await sql(admin, `INSERT INTO public.users(id,email,full_name,tier,email_verified_at) VALUES ($1,$2,'Profile Name','profile_complete',now())`, [draftOwner, `${draftOwner}@example.test`]);
  const submitOperation = uuid();
  const submitClient = await client();
  await claims(submitClient, { sub: service, role: 'service_role' });
  const submitArgs = [submitOperation, draftOwner, hmac(), 'national_id', 'Confirmed Legal Name', 'b'.repeat(64), true];
  const firstOperation = (await sql(submitClient, `SELECT public.begin_kyc_submission_v2($1,$2,$3,$4,$5,$6,$7) AS data`, submitArgs)).rows[0].data;
  const replayOperation = (await sql(submitClient, `SELECT public.begin_kyc_submission_v2($1,$2,$3,$4,$5,$6,$7) AS data`, submitArgs)).rows[0].data;
  if (firstOperation.submissionId !== replayOperation.submissionId) throw new Error('same KYC operation created more than one case');
  const userConfirmation = (await sql(submitClient, `SELECT public.record_kyc_user_confirmation($1,$2,$3,$4,$5,$6,$7,$8) AS id`,
    [firstOperation.submissionId, draftOwner, 'Confirmed Legal Name', 'national_id', hmac(), 'hmac_sha256_v1', '5678', 'c'.repeat(64)])).rows[0].id;
  const snapshot = (await sql(admin, `SELECT s.legal_name_snapshot,u.full_name,c.holder_name FROM public.kyc_submissions s
    JOIN public.users u ON u.id=s.user_id JOIN app_private.kyc_user_confirmations c ON c.submission_id=s.id WHERE s.id=$1`, [firstOperation.submissionId])).rows[0];
  if (snapshot.legal_name_snapshot !== 'Confirmed Legal Name' || snapshot.full_name !== 'Profile Name' || snapshot.holder_name !== 'Confirmed Legal Name' || !userConfirmation) {
    throw new Error(`profile and confirmed KYC sources were not separated: ${JSON.stringify(snapshot)}`);
  }
  ok('submission operation replays idempotently and user-confirmed KYC name stays separate from Profile');

  const draftId = uuid(); const draftRevision = 'd'.repeat(64);
  await sql(submitClient, `SELECT * FROM public.save_kyc_draft($1,$2,NULL,'national_id',NULL,$3,$4,$5,60,3600,NULL,NULL,NULL,NULL,'unknown')`,
    [draftOwner,draftId,`${draftOwner}/drafts/${draftId}/object/front.jpg`,`${draftOwner}/drafts/${draftId}/object/back.jpg`,draftRevision]);
  const ocrObservation = (await sql(submitClient, `SELECT public.record_kyc_draft_ocr_observation($1,$2,$3,'test-engine','OCR Name',$4,'5678','extracted',0.9,NULL) AS id`,
    [draftOwner,draftId,draftRevision,hmac()])).rows[0].id;
  const privateSource = (await sql(admin, `SELECT context_kind,document_number_hmac,holder_name FROM app_private.kyc_ocr_observations WHERE id=$1`, [ocrObservation])).rows[0];
  if (privateSource.context_kind !== 'draft' || privateSource.document_number_hmac !== hmac() || privateSource.holder_name !== 'OCR Name') throw new Error('server-side OCR source was not retained separately');
  const draftRows = await sql(submitClient, `SELECT count(*)::int AS count FROM public.get_kyc_draft($1)`, [draftOwner]);
  if (draftRows.rows[0].count !== 1) throw new Error('owner could not restore own draft');
  ok('short-lived owner draft restores with separate private OCR observation');
  await sql(submitClient, `SELECT public.delete_kyc_draft($1,$2)`, [draftOwner,draftId]);
  const claimedDraft = (await sql(submitClient, `SELECT * FROM public.claim_kyc_draft_purge(10,60)`)).rows[0];
  if (claimedDraft?.draft_id !== draftId || !claimedDraft.front_storage_path || !claimedDraft.back_storage_path) throw new Error('draft deletion did not queue its private images for cleanup');
  await sql(submitClient, `SELECT public.finish_kyc_draft_purge($1,true)`, [draftId]);
  const purgedDraft = await sql(admin, `SELECT count(*)::int AS count FROM app_private.kyc_drafts WHERE id=$1`, [draftId]);
  if (purgedDraft.rows[0].count !== 0) throw new Error('confirmed draft cleanup did not delete metadata');
  ok('draft deletion queues both images and removes OCR metadata only after confirmed cleanup');
  const activeDraftId = uuid();
  await sql(submitClient, `SELECT * FROM public.save_kyc_draft($1,$2,NULL,'national_id',NULL,$3,$4,$5,60,3600,NULL,NULL,NULL,NULL,'unknown')`,
    [draftOwner,activeDraftId,`${draftOwner}/drafts/${activeDraftId}/object/front.jpg`,`${draftOwner}/drafts/${activeDraftId}/object/back.jpg`,draftRevision]);
  try {
    const secondDraftId = uuid();
    await sql(submitClient, `SELECT * FROM public.save_kyc_draft($1,$2,NULL,'national_id',NULL,$3,$4,$5,60,3600,NULL,NULL,NULL,NULL,'unknown')`,
      [draftOwner,secondDraftId,`${draftOwner}/drafts/${secondDraftId}/object/front.jpg`,`${draftOwner}/drafts/${secondDraftId}/object/back.jpg`,draftRevision]);
    fail('one editing draft per account is enforced', 'second draft unexpectedly succeeded');
  } catch (e) { ok('one editing draft per account is enforced', e.message); }
  const capacityClient = await client();
  await claims(capacityClient, { sub: service, role: 'service_role' });
  const previewAdmission = (await sql(capacityClient, `SELECT app_private.claim_portal_workload('kyc_preview',$1) AS claimed`, [uuid()])).rows[0].claimed;
  if (previewAdmission !== false) throw new Error('OCR preview was admitted without measured capacity configuration');
  ok('OCR preview remains disabled until measured capacity is configured');
  await closeClient(capacityClient); await closeClient(submitClient);

  const uuids = [reviewer1, reviewer2, reviewer3, service];
  await sql(admin, `INSERT INTO public.users(id,email,full_name,kyc_status) SELECT x, x::text||'@example.test', 'Reviewer '||left(x::text,8), 'unverified' FROM unnest($1::uuid[]) AS t(x)`, [uuids]);
  await sql(admin, `INSERT INTO public.user_roles(user_id,role_id)
    SELECT x,'aaaaaaaa-0000-4000-8000-000000000001' FROM unnest($1::uuid[]) AS t(x)`, [[reviewer1, reviewer2, reviewer3]]);
  await sql(admin, `INSERT INTO auth.sessions(id,user_id) VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',$1),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',$2),('cccccccc-cccc-4ccc-8ccc-cccccccccccc',$3)`, [reviewer1, reviewer2, reviewer3]);
  await sql(admin, `INSERT INTO auth.sessions(id,user_id,not_after) VALUES ('88888888-8888-4888-8888-888888888888',$1,now()-interval '1 second')`, [service]);
  const expiredSession = await sql(admin, `SELECT app_private.is_live_kyc_session($1,'88888888-8888-4888-8888-888888888888') AS live`, [service]);
  if (expiredSession.rows[0]?.live !== false) throw new Error('expired reviewer session was accepted as live');
  ok('expired authentication session is rejected');
  const withdrawCase = uuid(); const withdrawOperation = uuid();
  await sql(admin, `SET session_replication_role = replica`);
  await sql(admin, `UPDATE public.users SET verified_kyc_submission_id=$2 WHERE id=$1`, [withdrawOwner, withdrawPreviousCase]);
  await sql(admin, `SET session_replication_role = origin`);
  await sql(admin, `INSERT INTO public.kyc_submissions(id,user_id,status,review_version,ic_hash,ic_hash_version,legal_name_snapshot,email_snapshot)
    VALUES ($1,$2,'pending',4,repeat('b',64),'hmac_sha256_v1','Withdraw User',$3)`, [withdrawCase, withdrawOwner, `${withdrawOwner}@example.test`]);
  const withdrawClient = await client();
  await claims(withdrawClient, { sub: withdrawOwner, role: 'authenticated' });
  await sql(withdrawClient, `SELECT public.withdraw_kyc_submission($1,4,$2)`, [withdrawCase, withdrawOperation]);
  await sql(withdrawClient, `SELECT public.withdraw_kyc_submission($1,4,$2)`, [withdrawCase, withdrawOperation]);
  const withdrawn = await sql(admin, `SELECT status FROM public.kyc_submissions WHERE id=$1`, [withdrawCase]);
  if (withdrawn.rows[0]?.status !== 'withdrawn') throw new Error('atomic KYC withdrawal did not commit');
  const retainedVerification = await sql(admin, `SELECT kyc_status,verified_kyc_submission_id FROM public.users WHERE id=$1`, [withdrawOwner]);
  if (retainedVerification.rows[0]?.kyc_status !== 'approved' || retainedVerification.rows[0]?.verified_kyc_submission_id !== withdrawPreviousCase) throw new Error('withdrawing a newer case removed a previous verified KYC');
  ok('pending withdrawal commits once, replays idempotently, and preserves an older verification');
  await closeClient(withdrawClient);
  await sql(admin, `INSERT INTO public.kyc_submissions(id,user_id,document_type,status,ic_hash,ic_hash_version,legal_name_snapshot,email_snapshot,created_at)
   SELECT gen_random_uuid(), $1, 'national_id', 'pending', repeat('a',64), 'hmac_sha256_v1', 'Person '||g, 'person'||g||'@example.test', now()-(g||' minutes')::interval
   FROM generate_series(1,10000) g`, [reviewer3]);
  ok('10,000 queue fixture inserted');

  const duplicateOwnerA = uuid(); const duplicateOwnerB = uuid();
  const duplicateSubmissionA = uuid(); const duplicateSubmissionB = uuid();
  await sql(admin, `INSERT INTO public.users(id,email,full_name) VALUES
    ($1,$2,'Duplicate A'),($3,$4,'Duplicate B')`, [duplicateOwnerA, `${duplicateOwnerA}@example.test`, duplicateOwnerB, `${duplicateOwnerB}@example.test`]);
  await sql(admin, `INSERT INTO public.kyc_submissions(id,user_id,status,ic_hash,ic_hash_version,legal_name_snapshot,email_snapshot)
    VALUES ($1,$2,'rejected',$3,'hmac_sha256_v1','Duplicate A',$4),($5,$6,'rejected',$3,'hmac_sha256_v1','Duplicate B',$7)`,
    [duplicateSubmissionA, duplicateOwnerA, hmac(), `${duplicateOwnerA}@example.test`, duplicateSubmissionB, duplicateOwnerB, `${duplicateOwnerB}@example.test`]);
  const identityConnA = await client(); const identityConnB = await client();
  const sameIc = await Promise.allSettled([
    sql(identityConnA, `INSERT INTO app_private.kyc_identity_bindings(identity_scope,hash_version,document_number_hmac,owner_user_id,current_verified_submission_id,state)
      VALUES ('MY_IC','hmac_sha256_v1',$1,$2,$3,'active')`, [hmac(), duplicateOwnerA, duplicateSubmissionA]),
    sql(identityConnB, `INSERT INTO app_private.kyc_identity_bindings(identity_scope,hash_version,document_number_hmac,owner_user_id,current_verified_submission_id,state)
      VALUES ('MY_IC','hmac_sha256_v1',$1,$2,$3,'active')`, [hmac(), duplicateOwnerB, duplicateSubmissionB]),
  ]);
  if (sameIc.filter((result) => result.status === 'fulfilled').length !== 1) throw new Error(`same IC concurrent inserts were not serialized: ${JSON.stringify(sameIc)}`);
  ok('real PostgreSQL unique key prevents two owners binding the same IC concurrently');
  const boundOwner = (await sql(admin, `SELECT owner_user_id FROM app_private.kyc_identity_bindings WHERE document_number_hmac=$1`, [hmac()])).rows[0].owner_user_id;
  await sql(admin, `UPDATE public.users SET status='deleted' WHERE id=$1`, [boundOwner]);
  const closedBinding = (await sql(admin, `SELECT state FROM app_private.kyc_identity_bindings WHERE owner_user_id=$1`, [boundOwner])).rows[0];
  await sql(admin, `UPDATE public.users SET status='active' WHERE id=$1`, [boundOwner]);
  const restoredBinding = (await sql(admin, `SELECT state FROM app_private.kyc_identity_bindings WHERE owner_user_id=$1`, [boundOwner])).rows[0];
  if (closedBinding.state !== 'reserved_closed' || restoredBinding.state !== 'reserved_closed') throw new Error('closing or restoring an account released its MY IC identity');
  ok('account close and restore preserve the reserved MY IC identity');

  const directService = await client();
  await claims(directService, { sub: service, role: 'service_role', aal: 'aal1', permitted: 'false' });
  try {
    await sql(directService, `UPDATE public.users SET kyc_status='approved' WHERE id=$1`, [duplicateOwnerA]);
    fail('service direct KYC approval is blocked', 'update unexpectedly succeeded');
  } catch (e) { ok('service direct KYC approval is blocked', e.message); }

  const legacyReviewer = await client();
  await claims(legacyReviewer, { sub: reviewer1, role: 'authenticated', aal: 'aal2', permitted: 'true' });
  try {
    await sql(legacyReviewer, `SELECT public.review_kyc_case($1,$2,0,'approve',NULL,NULL)`, [duplicateSubmissionA, duplicateOwnerA]);
    fail('legacy six-argument review cannot approve', 'call unexpectedly succeeded');
  } catch (e) { ok('legacy six-argument review cannot approve', e.message); }

  const reviewer = await client();
  await claims(reviewer, { sub: reviewer1, role: 'authenticated', aal: 'aal2', permitted: 'true' });
  const q = await sql(reviewer, `SELECT public.get_kyc_review_queue(400,25,'pending','all','') AS data`);
  const data = q.rows[0].data;
  if (data.total !== 10000 || data.totalPages !== 400 || data.pageSize !== 25 || data.submissions.length !== 25) throw new Error(`unexpected queue payload ${JSON.stringify({ total:data.total, totalPages:data.totalPages, pageSize:data.pageSize, length:data.submissions.length })}`);
  ok('bounded queue pagination and filtered total', `total=${data.total}, pages=${data.totalPages}, pageSize=${data.pageSize}`);

  const collisionOwnerA = uuid(); const collisionOwnerB = uuid();
  const collisionCaseA = uuid(); const collisionCaseB = uuid();
  const reviewer4 = uuid();
  await sql(admin, `UPDATE app_private.kyc_identity_control SET status='ready',coverage_epoch=1 WHERE singleton`);
  await sql(admin, `INSERT INTO public.users(id,email,full_name) VALUES
    ($1,$2,'Collision User A'),($3,$4,'Collision User B'),($5,$6,'Second reviewer four')`,
    [collisionOwnerA, `${collisionOwnerA}@example.test`, collisionOwnerB, `${collisionOwnerB}@example.test`, reviewer4, `${reviewer4}@example.test`]);
  await sql(admin, `INSERT INTO public.user_roles(user_id,role_id) VALUES ($1,'aaaaaaaa-0000-4000-8000-000000000001')`, [reviewer4]);
  await sql(admin, `INSERT INTO auth.sessions(id,user_id) VALUES
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',$1),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',$2),
    ('ffffffff-ffff-4fff-8fff-ffffffffffff',$3),('99999999-9999-4999-8999-999999999999',$4)`,
    [reviewer1, reviewer2, reviewer3, reviewer4]);
  await sql(admin, `INSERT INTO public.kyc_submissions(id,user_id,document_type,status,ic_hash,ic_hash_version,
    legal_name_snapshot,email_snapshot,assigned_to) VALUES
    ($1,$2,'national_id','pending',$5,'hmac_sha256_v1','Collision User A',$6,$7),
    ($3,$4,'national_id','pending',$5,'hmac_sha256_v1','Collision User B',$8,$9)`,
    [collisionCaseA, collisionOwnerA, collisionCaseB, collisionOwnerB, 'c'.repeat(64), `${collisionOwnerA}@example.test`, reviewer1, `${collisionOwnerB}@example.test`, reviewer2]);
  await sql(admin, `INSERT INTO public.kyc_submission_documents(submission_id,side,storage_path,mime_type)
    VALUES ($1,'front',$2,'image/jpeg'),($1,'back',$3,'image/jpeg'),($4,'front',$5,'image/jpeg'),($4,'back',$6,'image/jpeg')`,
    [collisionCaseA, `${collisionCaseA}/front.jpg`, `${collisionCaseA}/back.jpg`, collisionCaseB, `${collisionCaseB}/front.jpg`, `${collisionCaseB}/back.jpg`]);
  const evidenceA = (await sql(admin, `SELECT app_private.kyc_evidence_revision($1) AS revision`, [collisionCaseA])).rows[0].revision;
  const evidenceB = (await sql(admin, `SELECT app_private.kyc_evidence_revision($1) AS revision`, [collisionCaseB])).rows[0].revision;
  const primaryA = await client(); const primaryB = await client();
  const secondaryA = await client(); const secondaryB = await client();
  const stageService = await client();
  await claims(primaryA, { sub: reviewer1, role: 'authenticated', aal: 'aal2', sessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', permitted: 'true' });
  await claims(primaryB, { sub: reviewer2, role: 'authenticated', aal: 'aal2', sessionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', permitted: 'true' });
  await claims(secondaryA, { sub: reviewer3, role: 'authenticated', aal: 'aal2', sessionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', permitted: 'true' });
  await claims(secondaryB, { sub: reviewer4, role: 'authenticated', aal: 'aal2', sessionId: '99999999-9999-4999-8999-999999999999', permitted: 'true' });
  await claims(stageService, { sub: service, role: 'service_role', aal: 'aal1', permitted: 'true' });
  await sql(primaryA, `SELECT public.authorize_kyc_countersign($1,0,$2,$3,60)`, [collisionCaseA, evidenceA, reviewer3]);
  await sql(primaryB, `SELECT public.authorize_kyc_countersign($1,0,$2,$3,60)`, [collisionCaseB, evidenceB, reviewer4]);
  const eligibleCountersigners = await sql(primaryA, `SELECT user_id FROM public.list_kyc_countersign_candidates($1,0)`, [collisionCaseA]);
  if (!eligibleCountersigners.rows.some((row) => row.user_id === reviewer3)) throw new Error('eligible independent reviewer missing from candidates');
  ok('counter-sign candidates are resolved from active reviewer permissions');
  try {
    await sql(primaryA, `SELECT public.authorize_kyc_countersign($1,0,$2,$3,61)`, [collisionCaseA, evidenceA, reviewer3]);
    throw new Error('caller-supplied countersign TTL override unexpectedly succeeded');
  } catch (error) {
    if (!String(error?.message).includes('confirmation_ttl_unconfigured')) throw error;
  }
  ok('database rejects caller-supplied confirmation TTL overrides');
  async function stageAndAttest(caseId, reviewerId, sessionId, evidenceRevision, purpose, holderName, authenticatedClient) {
    const accessRefs = (await sql(admin, `INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
      VALUES ($1,'kyc.document_viewed','kyc_submission',$2,jsonb_build_object('side','front','evidence_revision',$3::text)),
             ($1,'kyc.document_viewed','kyc_submission',$2,jsonb_build_object('side','back','evidence_revision',$3::text)) RETURNING id`, [reviewerId, caseId, evidenceRevision])).rows.map((row) => row.id);
    const confirmationId = (await sql(stageService, `SELECT public.stage_kyc_identity_confirmation(
      $1,$2,$3,0,$4,'national_id','MY','my_ic',$6,$5,'manual',NULL,$8::uuid[],
      'ocr_unavailable',NULL,'high',$7,60) AS id`,
      [reviewerId, sessionId, caseId, evidenceRevision, 'c'.repeat(64), holderName, purpose, accessRefs])).rows[0].id;
    try {
      await sql(authenticatedClient, `SELECT public.attest_kyc_identity_confirmation($1)`, [confirmationId]);
    } catch (error) {
      throw new Error(`attestation failed for ${purpose}: ${error?.message ?? error}`);
    }
    return confirmationId;
  }
  // The user confirmation name must equal each immutable snapshot.
  const proofA = await stageAndAttest(collisionCaseA, reviewer1, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', evidenceA, 'primary', 'Collision User A', primaryA);
  const proofA2 = await stageAndAttest(collisionCaseA, reviewer3, 'ffffffff-ffff-4fff-8fff-ffffffffffff', evidenceA, 'independent_second', 'Collision User A', secondaryA);
  const proofB = await stageAndAttest(collisionCaseB, reviewer2, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', evidenceB, 'primary', 'Collision User B', primaryB);
  const proofB2 = await stageAndAttest(collisionCaseB, reviewer4, '99999999-9999-4999-8999-999999999999', evidenceB, 'independent_second', 'Collision User B', secondaryB);
  const collisionApprovals = await Promise.allSettled([
    sql(primaryA, `SELECT public.review_kyc_case_v2($1,$2,0,'approve',NULL,NULL,$3,$4,$5)`,
      [collisionCaseA, collisionOwnerA, uuid(), proofA, proofA2]),
    sql(primaryB, `SELECT public.review_kyc_case_v2($1,$2,0,'approve',NULL,NULL,$3,$4,$5)`,
      [collisionCaseB, collisionOwnerB, uuid(), proofB, proofB2]),
  ]);
  if (collisionApprovals.filter((result) => result.status === 'fulfilled').length !== 1) {
    throw new Error(`two authenticated approvals with the same IC did not produce exactly one winner: ${JSON.stringify(collisionApprovals)}`);
  }
  const approvedCollisionCount = await sql(admin, `SELECT count(*)::int AS count FROM public.users
    WHERE id = ANY($1::uuid[]) AND kyc_status='approved'`, [[collisionOwnerA, collisionOwnerB]]);
  if (approvedCollisionCount.rows[0].count !== 1) throw new Error(`same IC concurrent approvals created ${approvedCollisionCount.rows[0].count} verified owners: ${JSON.stringify(collisionApprovals.map((result) => ({ status: result.status, message: result.reason?.message })))}`);
  ok('two authenticated, independently attested concurrent approvals yield one verified owner');
  const approvedCollision = (await sql(admin, `SELECT id FROM public.kyc_submissions WHERE user_id = ANY($1::uuid[]) AND status='approved' LIMIT 1`, [[collisionOwnerA, collisionOwnerB]])).rows[0]?.id;
  try {
    await sql(admin, `UPDATE public.kyc_submissions SET ic_hash=$2 WHERE id=$1`, [approvedCollision, 'd'.repeat(64)]);
    throw new Error('approved identity rewrite unexpectedly succeeded');
  } catch (error) {
    if (!String(error?.message).includes('kyc_approved_identity_immutable')) throw error;
  }
  try {
    await sql(admin, `UPDATE public.kyc_submissions SET status='pending' WHERE id=$1`, [approvedCollision]);
    throw new Error('approved submission status regression unexpectedly succeeded');
  } catch (error) {
    if (!String(error?.message).includes('kyc_approved_identity_immutable')) throw error;
  }
  await sql(admin, `UPDATE public.kyc_submissions SET status='superseded' WHERE id=$1`, [approvedCollision]);
  try {
    await sql(admin, `UPDATE public.kyc_submissions SET document_type='passport' WHERE id=$1`, [approvedCollision]);
    throw new Error('historically verified identity rewrite unexpectedly succeeded');
  } catch (error) {
    if (!String(error?.message).includes('kyc_approved_identity_immutable')) throw error;
  }
  ok('approved and historically verified identity snapshots reject privileged rewrites');
  const resolutionOwner = uuid(); const conflictedOwner = uuid(); const resolutionCase = uuid(); const conflictedCase = uuid();
  const resolverRolePrimary = uuid(); const resolverRoleSecond = uuid();
  await sql(admin, `INSERT INTO public.users(id,email,full_name) VALUES
    ($1,$2,'Resolution Applicant'),($3,$4,'Conflicted Identity Holder')`,
    [resolutionOwner, `${resolutionOwner}@example.test`, conflictedOwner, `${conflictedOwner}@example.test`]);
  await sql(admin, `INSERT INTO public.staff_roles(id,is_active) VALUES ($1,true),($2,true)`, [resolverRolePrimary, resolverRoleSecond]);
  await sql(admin, `INSERT INTO public.staff_role_assignments(user_id,role_id) VALUES ($1,$2),($3,$4)`, [reviewer1, resolverRolePrimary, reviewer3, resolverRoleSecond]);
  await sql(admin, `INSERT INTO public.staff_role_modules(role_id,module_id) VALUES ($1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),($2,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')`, [resolverRolePrimary, resolverRoleSecond]);
  await sql(admin, `INSERT INTO public.staff_role_permissions(role_id,permission_id)
    SELECT r.role_id,p.id FROM unnest($1::uuid[]) r(role_id) CROSS JOIN public.staff_permissions p WHERE p.key IN ('admin.kyc.review','admin.kyc.resolve_identity')`, [[resolverRolePrimary, resolverRoleSecond]]);
  const conflictHash = 'e'.repeat(64);
  await sql(admin, `INSERT INTO public.kyc_submissions(id,user_id,document_type,status,ic_hash,ic_hash_version,legal_name_snapshot,email_snapshot,assigned_to)
    VALUES ($1,$2,'national_id','pending',$3,'hmac_sha256_v1','Conflicted Identity Holder',$4,$5),
           ($6,$7,'national_id','pending',$3,'hmac_sha256_v1','Resolution Applicant',$8,$9)`,
    [conflictedCase, conflictedOwner, conflictHash, `${conflictedOwner}@example.test`, reviewer1, resolutionCase, resolutionOwner, `${resolutionOwner}@example.test`, reviewer1]);
  await sql(admin, `INSERT INTO app_private.kyc_identity_bindings(identity_scope,hash_version,document_number_hmac,owner_user_id,current_verified_submission_id,state)
    VALUES('MY_IC','hmac_sha256_v1',$1,$2,$3,'legacy_conflict')`, [conflictHash, conflictedOwner, conflictedCase]);
  await sql(admin, `INSERT INTO public.kyc_submission_documents(submission_id,side,storage_path,mime_type)
    VALUES ($1,'front',$2,'image/jpeg'),($1,'back',$3,'image/jpeg')`, [resolutionCase, `${resolutionCase}/front.jpg`, `${resolutionCase}/back.jpg`]);
  const resolutionEvidence = (await sql(admin, `SELECT app_private.kyc_evidence_revision($1) AS revision`, [resolutionCase])).rows[0].revision;
  const resolutionOperation = uuid();
  try {
    await sql(primaryB, `SELECT public.create_kyc_identity_resolution($1,'ownership_correction','legacy_resolution',NULL,$2)`, [resolutionCase, uuid()]);
    throw new Error('reviewer without explicit resolution permission unexpectedly created a resolution');
  } catch (error) {
    if (!String(error?.message).includes('permission_required')) throw error;
  }
  try {
    await sql(primaryA, `SELECT count(*) FROM app_private.kyc_identity_resolution_authorizations`);
    throw new Error('authenticated role unexpectedly read private resolver authorizations');
  } catch (error) {
    if (!String(error?.message).includes('permission denied')) throw error;
  }
  const resolutionStart = await sql(primaryA, `SELECT public.create_kyc_identity_resolution($1,'ownership_correction','legacy_resolution',NULL,$2) AS data`, [resolutionCase, resolutionOperation]);
  const resolutionId = resolutionStart.rows[0].data.id;
  if (!resolutionId) throw new Error('identity resolution proposal was not created');
  const resolutionStartReplay = await sql(primaryA, `SELECT public.create_kyc_identity_resolution($1,'ownership_correction','legacy_resolution',NULL,$2) AS data`, [resolutionCase, resolutionOperation]);
  if (resolutionStartReplay.rows[0].data.id !== resolutionId || resolutionStartReplay.rows[0].data.status !== 'open') {
    throw new Error(`identity resolution start replay returned a different result: ${JSON.stringify(resolutionStartReplay.rows[0].data)}`);
  }
  const resolutionCandidates = await sql(primaryA, `SELECT user_id FROM public.list_kyc_identity_resolver_candidates($1,1)`, [resolutionId]);
  if (!resolutionCandidates.rows.some((row) => row.user_id === reviewer3)) throw new Error('explicit resolution reviewer missing from candidate list');
  await sql(primaryA, `SELECT public.authorize_kyc_identity_resolution($1,1,$2)`, [resolutionId, reviewer3]);
  await sql(primaryA, `SELECT public.authorize_kyc_identity_resolution($1,1,$2)`, [resolutionId, reviewer3]);
  for (const [actor, sessionId] of [[reviewer1, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'], [reviewer3, 'ffffffff-ffff-4fff-8fff-ffffffffffff']]) {
    const refs = (await sql(admin, `INSERT INTO public.audit_logs(actor_id,action,entity_type,entity_id,after_data)
      VALUES($1,'kyc.document_viewed','kyc_submission',$2,jsonb_build_object('side','front','evidence_revision',$3::text)),
            ($1,'kyc.document_viewed','kyc_submission',$2,jsonb_build_object('side','back','evidence_revision',$3::text)) RETURNING id`, [actor, resolutionCase, resolutionEvidence])).rows.map((row) => row.id);
    const role = actor === reviewer1 ? 'primary' : 'independent_second';
    const confirmationId = (await sql(stageService, `SELECT public.stage_kyc_resolution_confirmation($1,$2,$3,1,$4,$5::uuid[],
      'national_id','MY','my_ic','Resolution Applicant',$6,'Identity correction evidence reviewed',60) AS id`,
      [actor, sessionId, resolutionId, role, refs, conflictHash])).rows[0].id;
    await sql(actor === reviewer1 ? primaryA : secondaryA, `SELECT public.attest_kyc_resolution_confirmation($1)`, [confirmationId]);
  }
  const resolutionSnapshot = (await sql(primaryA, `SELECT public.get_kyc_identity_resolution($1) AS data`, [resolutionId])).rows[0].data;
  const resolutionJson = JSON.stringify(resolutionSnapshot);
  if (resolutionJson.includes(conflictHash) || resolutionJson.includes('affected_keys') || resolutionSnapshot.primaryConfirmed !== true || resolutionSnapshot.secondaryConfirmed !== true) {
    throw new Error(`resolution summary leaked private identity data or missed attestations: ${resolutionJson}`);
  }
  for (const [label, version, secondActor] of [['stale version', 2, reviewer3], ['same actor', 1, reviewer1]]) {
    try {
      await sql(primaryA, `SELECT public.authorize_kyc_identity_resolution($1,$2,$3)`, [resolutionId, version, secondActor]);
      throw new Error(`${label} resolution authorization unexpectedly succeeded`);
    } catch (error) {
      if (!String(error?.message).includes('changed')) throw error;
    }
  }
  await sql(admin, `UPDATE app_private.kyc_identity_bindings SET version=version+1 WHERE document_number_hmac=$1`, [conflictHash]);
  try {
    await sql(primaryA, `SELECT public.apply_kyc_identity_resolution($1,1,$2)`, [resolutionId, uuid()]);
    throw new Error('stale binding version unexpectedly applied');
  } catch (error) {
    if (!String(error?.message).includes('state_conflict')) throw error;
  }
  const rolledBackResolution = await sql(admin, `SELECT r.status,c.consumed_at,(SELECT count(*)::int FROM app_private.kyc_identity_events e WHERE e.resolution_id=r.id) AS events
    FROM app_private.kyc_identity_resolutions r JOIN app_private.kyc_review_confirmations c ON c.resolution_id=r.id AND c.resolution_actor_role='primary'
    WHERE r.id=$1`, [resolutionId]);
  if (rolledBackResolution.rows[0].status !== 'second_review' || rolledBackResolution.rows[0].consumed_at !== null || rolledBackResolution.rows[0].events !== 0) {
    throw new Error(`failed apply left partial resolution effects: ${JSON.stringify(rolledBackResolution.rows[0])}`);
  }
  await sql(admin, `UPDATE app_private.kyc_identity_bindings SET version=version-1 WHERE document_number_hmac=$1`, [conflictHash]);
  ok('stale version/binding and same-actor negatives fail; failed apply rolls back cleanly');
  const applyOperation = uuid();
  const concurrentResolutionApplies = await Promise.allSettled([
    sql(primaryA, `SELECT public.apply_kyc_identity_resolution($1,1,$2)`, [resolutionId, applyOperation]),
    sql(primaryA, `SELECT public.apply_kyc_identity_resolution($1,1,$2)`, [resolutionId, uuid()]),
  ]);
  if (concurrentResolutionApplies.filter((result) => result.status === 'fulfilled').length !== 1) {
    throw new Error(`concurrent identity resolution did not produce exactly one application: ${JSON.stringify(concurrentResolutionApplies)}`);
  }
  await sql(primaryA, `SELECT public.apply_kyc_identity_resolution($1,1,$2)`, [resolutionId, applyOperation]);
  await sql(admin, `UPDATE public.kyc_submissions SET assigned_to=$2 WHERE id=$1`, [resolutionCase, reviewer2]);
  await sql(primaryA, `SELECT public.apply_kyc_identity_resolution($1,1,$2)`, [resolutionId, applyOperation]);
  const resolutionStartAfterApply = await sql(primaryA, `SELECT public.create_kyc_identity_resolution($1,'ownership_correction','legacy_resolution',NULL,$2) AS data`, [resolutionCase, resolutionOperation]);
  if (resolutionStartAfterApply.rows[0].data.id !== resolutionId || resolutionStartAfterApply.rows[0].data.status !== 'applied') {
    throw new Error(`identity resolution start replay did not return the current terminal state: ${JSON.stringify(resolutionStartAfterApply.rows[0].data)}`);
  }
  await sql(admin, `UPDATE public.kyc_submissions SET assigned_to=$2 WHERE id=$1`, [resolutionCase, reviewer1]);
  const cancelledResolutionId = (await sql(primaryA, `SELECT (public.create_kyc_identity_resolution($1,'ownership_correction','legacy_resolution',NULL,$2)->>'id')::uuid AS id`, [resolutionCase, uuid()])).rows[0].id;
  await sql(primaryA, `SELECT public.authorize_kyc_identity_resolution($1,1,$2)`, [cancelledResolutionId, reviewer3]);
  try {
    await sql(secondaryA, `SELECT public.cancel_kyc_identity_resolution($1,1,'reviewer_declined')`, [cancelledResolutionId]);
    throw new Error('unassigned independent reviewer unexpectedly cancelled the resolution');
  } catch (error) {
    if (!String(error?.message).includes('assignment_required')) throw error;
  }
  await sql(primaryA, `SELECT public.cancel_kyc_identity_resolution($1,1,'evidence_unavailable')`, [cancelledResolutionId]);
  await sql(primaryA, `SELECT public.cancel_kyc_identity_resolution($1,1,'evidence_unavailable')`, [cancelledResolutionId]);
  const cancelledStatus = await sql(admin, `SELECT status,cancelled_by,cancellation_reason_code FROM app_private.kyc_identity_resolutions WHERE id=$1`, [cancelledResolutionId]);
  const cancelBinding = (await sql(admin, `SELECT owner_user_id,state FROM app_private.kyc_identity_bindings WHERE document_number_hmac=$1`, [conflictHash])).rows[0];
  if (cancelledStatus.rows[0].status !== 'cancelled' || cancelledStatus.rows[0].cancelled_by !== reviewer1
      || cancelledStatus.rows[0].cancellation_reason_code !== 'evidence_unavailable'
      || cancelBinding.owner_user_id !== conflictedOwner || cancelBinding.state !== 'legacy_conflict') {
    throw new Error(`cancellation failed to close only the proposal: ${JSON.stringify({ cancelled: cancelledStatus.rows[0], binding: cancelBinding })}`);
  }
  ok('cancelled identity resolutions invalidate their active slot without changing identity ownership');
  const resolvedBinding = (await sql(admin, `SELECT owner_user_id,state FROM app_private.kyc_identity_bindings WHERE document_number_hmac=$1`, [conflictHash])).rows[0];
  const unresolvedQualifications = await sql(admin, `SELECT count(*)::int AS count FROM public.users WHERE id=ANY($1::uuid[]) AND kyc_status='approved'`, [[conflictedOwner, resolutionOwner]]);
  if (resolvedBinding.owner_user_id !== conflictedOwner || resolvedBinding.state !== 'legacy_conflict' || unresolvedQualifications.rows[0].count !== 0) {
    throw new Error(`resolution failed to freeze the disputed identity without selecting an owner: ${JSON.stringify({ resolvedBinding, count: unresolvedQualifications.rows[0].count })}`);
  }
  const resolutionEvents = await sql(admin, `SELECT count(*)::int AS count FROM app_private.kyc_identity_events WHERE resolution_id=$1`, [resolutionId]);
  if (resolutionEvents.rows[0].count !== 1) throw new Error(`expected one immutable resolution event, got ${resolutionEvents.rows[0].count}`);
  try {
    await sql(stageService, `SELECT public.apply_kyc_identity_resolution($1,1,$2)`, [resolutionId, uuid()]);
    throw new Error('service-role identity resolution apply unexpectedly succeeded');
  } catch (error) {
    if (!String(error?.message).includes('permission_required') && !String(error?.message).includes('permission denied')) throw error;
  }
  ok('identity resolution requires explicit two-person authority, hides identity keys, and reserves pending re-verification');
  await sql(admin, `UPDATE public.kyc_submissions SET status='rejected' WHERE id = $1 AND status='pending'`, [collisionCaseA]);
  await sql(admin, `UPDATE public.kyc_submissions SET status='rejected' WHERE id = $1 AND status='pending'`, [collisionCaseB]);
  const serviceAttest = await client();
  await claims(serviceAttest, { sub: service, role: 'service_role', aal: 'aal2', permitted: 'true' });
  try {
    await sql(serviceAttest, `SELECT public.attest_kyc_identity_confirmation($1)`, [proofA]);
    fail('service role cannot attest a staged proof', 'call unexpectedly succeeded');
  } catch (e) { ok('service role cannot attest a staged proof', e.message); }

  const denied = await client();
  await claims(denied, { sub: reviewer1, role: 'authenticated', aal: 'aal1', permitted: 'true' });
  try { await sql(denied, `SELECT public.get_kyc_review_queue(1,10,'all','all','')`); fail('AAL2 gate rejects aal1', 'call unexpectedly succeeded'); }
  catch (e) { ok('AAL2 gate rejects aal1', e.message); }
  await claims(denied, { sub: reviewer1, role: 'authenticated', aal: 'aal2', permitted: 'false' });
  try { await sql(denied, `SELECT public.get_kyc_review_queue(1,10,'all','all','')`); fail('permission gate rejects non-reviewer', 'call unexpectedly succeeded'); }
  catch (e) { ok('permission gate rejects non-reviewer', e.message); }
  try { await sql(denied, `SELECT count(*) FROM public.kyc_prescreening_jobs`); fail('authenticated role cannot read private job table', 'query unexpectedly succeeded'); }
  catch (e) { ok('authenticated role cannot read private job table', e.message); }

  const workerA = await client(); const workerB = await client();
  await claims(workerA, { sub: reviewer1, role: 'authenticated', aal: 'aal2', permitted: 'true' });
  await claims(workerB, { sub: reviewer2, role: 'authenticated', aal: 'aal2', permitted: 'true' });
  const [nextA, nextB] = await Promise.all([
    sql(workerA, `SELECT public.manage_kyc_review_work('next',NULL) AS data`),
    sql(workerB, `SELECT public.manage_kyc_review_work('next',NULL) AS data`),
  ]);
  const picked = [nextA.rows[0].data.submissionId, nextB.rows[0].data.submissionId];
  if (!picked[0] || !picked[1] || picked[0] === picked[1]) throw new Error(`concurrent next duplicated ${JSON.stringify(picked)}`);
  const assigned = await sql(admin, `SELECT count(*)::int AS count FROM public.kyc_submissions WHERE id=ANY($1::uuid[]) AND assigned_to IS NOT NULL`, [picked]);
  if (assigned.rows[0].count !== 2) throw new Error(`expected 2 assigned rows, got ${assigned.rows[0].count}`);
  ok('concurrent reviewer next-case claims are distinct', picked.join(', '));

  const staleId = picked[0];
  const staleVersion = nextA.rows[0].data.reviewVersion;
  await sql(admin, `UPDATE public.kyc_submissions SET assigned_to=$1 WHERE id=$2`, [reviewer3, staleId]);
  await claims(reviewer, { sub: reviewer1, role: 'authenticated', aal: 'aal2', permitted: 'true' });
  try {
    await sql(reviewer, `SELECT public.review_kyc_case($1,$2,$3,'approve',NULL,NULL)`, [staleId, (await sql(admin, `SELECT user_id FROM public.kyc_submissions WHERE id=$1`, [staleId])).rows[0].user_id, staleVersion]);
    fail('stale review version is fenced', 'call unexpectedly succeeded');
  } catch (e) { ok('stale review version is fenced', e.message); }

  // A reviewer can only pause the session instance that it started. Starting
  // again interrupts the old interval; a delayed browser pause must not close
  // the new interval.
  const sessionTarget = picked[1];
  const sessionVersion = nextB.rows[0].data.reviewVersion;
  const firstSession = (await sql(workerB, `SELECT public.manage_kyc_review_work('start',$1,$2,NULL) AS data`, [sessionTarget, sessionVersion])).rows[0].data.sessionId;
  const secondSession = (await sql(workerB, `SELECT public.manage_kyc_review_work('start',$1,$2,NULL) AS data`, [sessionTarget, sessionVersion])).rows[0].data.sessionId;
  if (!firstSession || !secondSession || firstSession === secondSession) throw new Error('start did not replace the prior session');
  await sql(workerB, `SELECT public.manage_kyc_review_work('pause',$1,$2,$3)`, [sessionTarget, sessionVersion, firstSession]);
  const sessionRows = await sql(admin, `SELECT id,ended_at,end_reason FROM public.kyc_review_work_sessions WHERE id=ANY($1::uuid[]) ORDER BY id`, [[firstSession, secondSession]]);
  const oldRow = sessionRows.rows.find((row) => row.id === firstSession);
  const newRow = sessionRows.rows.find((row) => row.id === secondSession);
  if (!oldRow?.ended_at || oldRow.end_reason !== 'interrupted' || newRow?.ended_at) throw new Error(`stale pause changed the wrong interval ${JSON.stringify(sessionRows.rows)}`);
  await sql(workerB, `SELECT public.manage_kyc_review_work('pause',$1,$2,$3)`, [sessionTarget, sessionVersion, secondSession]);
  ok('stale pause cannot close a newer review interval');

  const jobUser = uuid(); const jobSubmission = uuid();
  await sql(admin, `INSERT INTO public.users(id,email,full_name) VALUES($1,$2,'OCR Job User')`, [jobUser, `${jobUser}@example.test`]);
  await sql(admin, `INSERT INTO public.kyc_submissions(id,user_id,status,ic_hash,ic_hash_version,legal_name_snapshot,email_snapshot) VALUES($1,$2,'pending',$3,'hmac_sha256_v1','OCR Job User',$4)`, [jobSubmission, jobUser, hmac(), `${jobUser}@example.test`]);
  await sql(admin, `INSERT INTO public.kyc_submission_documents(submission_id,side,storage_path,mime_type) VALUES($1,'front',$2,'image/jpeg'),($1,'back',$3,'image/jpeg')`, [jobSubmission, `${jobSubmission}/front.jpg`, `${jobSubmission}/back.jpg`]);
  const svc = await client(); await claims(svc, { sub: service, role: 'service_role', aal: 'aal1', permitted: 'false' });
  const firstJob = (await sql(svc, `SELECT public.ensure_kyc_prescreening($1) AS id`, [jobSubmission])).rows[0].id;
  const secondJob = (await sql(svc, `SELECT public.ensure_kyc_prescreening($1) AS id`, [jobSubmission])).rows[0].id;
  if (firstJob !== secondJob) throw new Error(`ensure created duplicate jobs: ${firstJob} vs ${secondJob}`);
  const jobCount = await sql(admin, `SELECT count(*)::int AS count FROM public.kyc_prescreening_jobs WHERE submission_id=$1`, [jobSubmission]);
  if (jobCount.rows[0].count !== 1) throw new Error(`expected one deduplicated job, got ${jobCount.rows[0].count}`);
  ok('prescreening job is idempotent', String(firstJob));
  const claimed = (await sql(svc, `SELECT public.claim_kyc_prescreening_jobs(1,60,3,1) AS data`)).rows[0].data;
  if (!Array.isArray(claimed) || claimed.length !== 1) throw new Error(`unexpected claim ${JSON.stringify(claimed)}`);
  const token = claimed[0].leaseToken;
  const blocked = (await sql(svc, `SELECT public.claim_kyc_prescreening_jobs(1,60,3,1) AS data`)).rows[0].data;
  if (blocked.length !== 0) throw new Error(`max_running ignored ${JSON.stringify(blocked)}`);
  ok('worker max-running cap holds while lease is active');
  const wrong = (await sql(svc, `SELECT public.finish_kyc_prescreening_job($1,$2,$3::jsonb,60) AS ok`, [firstJob, uuid(), JSON.stringify({ status:'unavailable' })])).rows[0].ok;
  if (wrong !== false) throw new Error(`wrong token accepted: ${wrong}`);
  ok('stale prescreening lease token is rejected');
  try {
    await sql(svc, `SELECT public.finish_kyc_prescreening_job($1,$2,$3::jsonb,60) AS ok`, [firstJob, token, JSON.stringify({ status:'matched', documentNumberHmac:hmac(), mismatchFields:[] })]);
    ok('matched prescreen result accepted');
  } catch (e) {
    fail('matched prescreen result accepted', e);
    console.error('This is the expected signature/finish-path check; inspect record_kyc_ocr_result and outcome assignment.', e.message);
  }
  const legacyProvider = (await sql(admin, `SELECT provider_model FROM public.kyc_ocr_results WHERE submission_id=$1`, [jobSubmission])).rows[0]?.provider_model;
  if (legacyProvider !== 'private-ocr-v1') throw new Error('legacy provider compatibility failed');
  for (const provider of ['not-allowed', 'tesseract-js-7.0.0-v1']) {
    await sql(admin, `UPDATE public.kyc_prescreening_jobs SET status='processing',lease_token=$2,lease_expires_at=now()+interval '60 seconds' WHERE id=$1`, [firstJob, token]);
    let accepted = false;
    try {
      const completed = await sql(svc, `SELECT public.finish_kyc_prescreening_job($1,$2,$3::jsonb,60) AS ok`, [firstJob, token,
        JSON.stringify({ status:'matched', documentNumberHmac:hmac(), mismatchFields:[], providerModel:provider })]);
      accepted = completed.rows[0].ok;
    } catch (error) { if (provider !== 'not-allowed' || !error.message.includes('invalid_ocr_provider')) throw error; }
    if (accepted !== (provider !== 'not-allowed')) throw new Error('provider whitelist failed');
  }
  const actualProvider = (await sql(admin, `SELECT provider_model FROM public.kyc_ocr_results WHERE submission_id=$1`, [jobSubmission])).rows[0]?.provider_model;
  if (actualProvider !== 'tesseract-js-7.0.0-v1') throw new Error('Node provider not recorded');
  ok('legacy compatibility, Node provenance and unknown provider rejection');
  for (const role of ['anon', 'authenticated']) {
    await sql(admin, `SET ROLE ${role}`);
    let denied = false;
    try { await sql(admin, `SELECT public.finish_kyc_prescreening_job($1,$2,$3::jsonb,60)`, [firstJob, token, JSON.stringify({status:'unavailable'})]); }
    catch { denied = true; }
    finally { await sql(admin, 'RESET ROLE'); }
    if (!denied) throw new Error('unprivileged OCR completion accepted');
  }
  ok('anon and authenticated cannot finish a service OCR job');

  const jobState = await sql(admin, `SELECT status,outcome,last_error_code FROM public.kyc_prescreening_jobs WHERE id=$1`, [firstJob]);
  console.log(`JOB_STATE ${JSON.stringify(jobState.rows[0])}`);

  // Two service connections racing for two ready jobs must never receive the
  // same row. The advisory budget lock serializes the capacity calculation,
  // while SKIP LOCKED makes the handoff atomic.
  const raceIds = [];
  for (let i = 0; i < 2; i += 1) {
    const u = uuid(); const s = uuid(); raceIds.push(s);
    await sql(admin, `INSERT INTO public.users(id,email,full_name) VALUES($1,$2,$3)`, [u, `${u}@example.test`, `Race User ${i}`]);
    await sql(admin, `INSERT INTO public.kyc_submissions(id,user_id,status,ic_hash,ic_hash_version,legal_name_snapshot,email_snapshot) VALUES($1,$2,'pending',$3,'hmac_sha256_v1',$4,$5)`, [s, u, hmac(), `Race User ${i}`, `${u}@example.test`]);
    await sql(admin, `INSERT INTO public.kyc_submission_documents(submission_id,side,storage_path,mime_type) VALUES($1,'front',$2,'image/jpeg'),($1,'back',$3,'image/jpeg')`, [s, `${s}/front.jpg`, `${s}/back.jpg`]);
    await sql(svc, `SELECT public.ensure_kyc_prescreening($1)`, [s]);
  }
  const workerC = await client(); const workerD = await client();
  await claims(workerC, { sub: service, role: 'service_role', aal: 'aal1', permitted: 'false' });
  await claims(workerD, { sub: service, role: 'service_role', aal: 'aal1', permitted: 'false' });
  const [raceA, raceB] = await Promise.all([
    sql(workerC, `SELECT public.claim_kyc_prescreening_jobs(1,60,3,2) AS data`),
    sql(workerD, `SELECT public.claim_kyc_prescreening_jobs(1,60,3,2) AS data`),
  ]);
  const raceClaimed = [raceA.rows[0].data[0]?.id, raceB.rows[0].data[0]?.id];
  if (!raceClaimed[0] || !raceClaimed[1] || raceClaimed[0] === raceClaimed[1]) throw new Error(`concurrent worker claims duplicated ${JSON.stringify(raceClaimed)}`);
  ok('concurrent worker claims are distinct', raceClaimed.join(', '));

  // Replacing the evidence rows after a lease is issued changes the revision;
  // the old worker result must cancel without writing OCR output.
  const revisionUser = uuid(); const revisionSubmission = uuid();
  await sql(admin, `INSERT INTO public.users(id,email,full_name) VALUES($1,$2,'Revision User')`, [revisionUser, `${revisionUser}@example.test`]);
  await sql(admin, `INSERT INTO public.kyc_submissions(id,user_id,status,ic_hash,ic_hash_version,legal_name_snapshot,email_snapshot) VALUES($1,$2,'pending',$3,'hmac_sha256_v1','Revision User',$4)`, [revisionSubmission, revisionUser, hmac(), `${revisionUser}@example.test`]);
  await sql(admin, `INSERT INTO public.kyc_submission_documents(submission_id,side,storage_path,mime_type) VALUES($1,'front',$2,'image/jpeg'),($1,'back',$3,'image/jpeg')`, [revisionSubmission, `${revisionSubmission}/old-front.jpg`, `${revisionSubmission}/old-back.jpg`]);
  const revisionJob = (await sql(svc, `SELECT public.ensure_kyc_prescreening($1) AS id`, [revisionSubmission])).rows[0].id;
  const revisionClaim = (await sql(svc, `SELECT public.claim_kyc_prescreening_jobs(1,60,3,20) AS data`)).rows[0].data.find((row) => row.id === revisionJob);
  if (!revisionClaim) throw new Error('revision job was not claimed');
  await sql(admin, `DELETE FROM public.kyc_submission_documents WHERE submission_id=$1`, [revisionSubmission]);
  await sql(admin, `INSERT INTO public.kyc_submission_documents(submission_id,side,storage_path,mime_type) VALUES($1,'front',$2,'image/jpeg'),($1,'back',$3,'image/jpeg')`, [revisionSubmission, `${revisionSubmission}/new-front.jpg`, `${revisionSubmission}/new-back.jpg`]);
  const staleRevision = (await sql(svc, `SELECT public.finish_kyc_prescreening_job($1,$2,$3::jsonb,60) AS ok`, [revisionJob, revisionClaim.leaseToken, JSON.stringify({ status:'matched', documentNumberHmac:hmac(), mismatchFields:[] })])).rows[0].ok;
  const staleState = (await sql(admin, `SELECT status,last_error_code FROM public.kyc_prescreening_jobs WHERE id=$1`, [revisionJob])).rows[0];
  if (staleRevision !== false || staleState.status !== 'cancelled' || staleState.last_error_code !== 'case_closed') throw new Error(`stale revision was accepted ${JSON.stringify({ staleRevision, staleState })}`);
  ok('stale evidence revision is fenced and cancelled', JSON.stringify(staleState));

  const expiredUser = uuid(); const expiredSubmission = uuid();
  await sql(admin, `INSERT INTO public.users(id,email,full_name) VALUES($1,$2,'Expired Lease User')`, [expiredUser, `${expiredUser}@example.test`]);
  await sql(admin, `INSERT INTO public.kyc_submissions(id,user_id,status,ic_hash,ic_hash_version,legal_name_snapshot,email_snapshot) VALUES($1,$2,'pending',$3,'hmac_sha256_v1','Expired Lease User',$4)`, [expiredSubmission, expiredUser, hmac(), `${expiredUser}@example.test`]);
  await sql(admin, `INSERT INTO public.kyc_submission_documents(submission_id,side,storage_path,mime_type) VALUES($1,'front',$2,'image/jpeg'),($1,'back',$3,'image/jpeg')`, [expiredSubmission, `${expiredSubmission}/front.jpg`, `${expiredSubmission}/back.jpg`]);
  const expiredJob = (await sql(svc, `SELECT public.ensure_kyc_prescreening($1) AS id`, [expiredSubmission])).rows[0].id;
  const expiredClaim = (await sql(svc, `SELECT public.claim_kyc_prescreening_jobs(1,1,3,20) AS data`, [])).rows[0].data.find((row) => row.id === expiredJob);
  if (!expiredClaim) throw new Error('expired lease job was not claimed');
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const expiredFinish = (await sql(svc, `SELECT public.finish_kyc_prescreening_job($1,$2,$3::jsonb,1) AS ok`, [expiredJob, expiredClaim.leaseToken, JSON.stringify({ status:'unavailable' })])).rows[0].ok;
  if (expiredFinish !== false) throw new Error(`expired lease was accepted: ${expiredFinish}`);
  const reclaimedExpired = (await sql(svc, `SELECT public.claim_kyc_prescreening_jobs(20,60,3,20) AS data`)).rows[0].data.find((row) => row.id === expiredJob);
  if (!reclaimedExpired || reclaimedExpired.leaseToken === expiredClaim.leaseToken) throw new Error('expired lease was not reclaimed with a new token');
  ok('expired worker lease is rejected and reclaimed');

  const terminalUser = uuid(); const terminalSubmission = uuid();
  await sql(admin, `INSERT INTO public.users(id,email,full_name) VALUES($1,$2,'Terminal OCR User')`, [terminalUser, `${terminalUser}@example.test`]);
  await sql(admin, `INSERT INTO public.kyc_submissions(id,user_id,status,ic_hash,ic_hash_version,legal_name_snapshot,email_snapshot) VALUES($1,$2,'pending',$3,'hmac_sha256_v1','Terminal OCR User',$4)`, [terminalSubmission, terminalUser, hmac(), `${terminalUser}@example.test`]);
  await sql(admin, `INSERT INTO public.kyc_submission_documents(submission_id,side,storage_path,mime_type) VALUES($1,'front',$2,'image/jpeg'),($1,'back',$3,'image/jpeg')`, [terminalSubmission, `${terminalSubmission}/front.jpg`, `${terminalSubmission}/back.jpg`]);
  const terminalJob = (await sql(svc, `SELECT public.ensure_kyc_prescreening($1) AS id`, [terminalSubmission])).rows[0].id;
  const terminalClaim = (await sql(svc, `SELECT public.claim_kyc_prescreening_jobs(20,60,1,20) AS data`, [])).rows[0].data.find((row) => row.id === terminalJob);
  if (!terminalClaim) throw new Error('terminal job was not claimed');
  const terminalFinish = (await sql(svc, `SELECT public.finish_kyc_prescreening_job($1,$2,$3::jsonb,1) AS ok`, [terminalJob, terminalClaim.leaseToken, JSON.stringify({ status:'unavailable' })])).rows[0].ok;
  const terminalState = (await sql(admin, `SELECT status,outcome,last_error_code,finished_at FROM public.kyc_prescreening_jobs WHERE id=$1`, [terminalJob])).rows[0];
  if (terminalFinish !== true || terminalState.status !== 'failed' || terminalState.outcome !== 'manual_review' || terminalState.last_error_code !== 'ocr_unavailable' || !terminalState.finished_at) throw new Error(`terminal retry was not finalized ${JSON.stringify({ terminalFinish, terminalState })}`);
  ok('max-attempt OCR failure reaches a terminal manual-review state');

  // Permanent evidence/config errors do not spend every remaining attempt.
  await sql(admin, `UPDATE public.kyc_prescreening_jobs SET status='processing',attempts=1,attempt_limit=3,lease_token=$2,lease_expires_at=now()+interval '1 minute' WHERE id=$1`, [terminalJob, token]);
  await sql(svc, `SELECT public.finish_kyc_prescreening_job($1,$2,$3::jsonb,60)`, [terminalJob, token, JSON.stringify({status:'unavailable',retryable:false,failureCode:'evidence_missing'})]);
  const permanent = (await sql(admin, `SELECT status,last_error_code FROM public.kyc_prescreening_jobs WHERE id=$1`, [terminalJob])).rows[0];
  if (permanent.status !== 'failed' || permanent.last_error_code !== 'evidence_missing') throw new Error('permanent failure was retried');
  await sql(admin, `UPDATE public.kyc_prescreening_jobs SET status='processing',attempts=2,attempt_limit=3,lease_token=$2,lease_expires_at=now()+interval '1 minute' WHERE id=$1`, [terminalJob, token]);
  await sql(svc, `SELECT public.finish_kyc_prescreening_job($1,$2,$3::jsonb,60)`, [terminalJob, token, JSON.stringify({status:'unavailable',retryable:true,failureCode:'network'})]);
  const retry = (await sql(admin, `SELECT status,extract(epoch from available_at-now()) AS delay FROM public.kyc_prescreening_jobs WHERE id=$1`, [terminalJob])).rows[0];
  if (retry.status !== 'queued' || Number(retry.delay) < 115 || Number(retry.delay) > 121) throw new Error('transient failure did not use bounded backoff');
  ok('permanent failures stop and transient failures back off without deciding the case');

  // Isolate a release/reclaim race from the large fixture. A non-super-admin
  // cannot release another reviewer, while a version-matched global reviewer
  // can; the old reviewer then cannot decide after the case is reclaimed.
  await sql(admin, `UPDATE public.kyc_submissions SET status='rejected' WHERE status='pending'`);
  const releaseUser = uuid(); const releaseSubmission = uuid();
  await sql(admin, `INSERT INTO public.users(id,email,full_name) VALUES($1,$2,'Release User')`, [releaseUser, `${releaseUser}@example.test`]);
  await sql(admin, `INSERT INTO public.kyc_submissions(id,user_id,status,ic_hash,ic_hash_version,legal_name_snapshot,email_snapshot,created_at) VALUES($1,$2,'pending',$3,'hmac_sha256_v1','Release User',$4,now())`, [releaseSubmission, releaseUser, hmac(), `${releaseUser}@example.test`]);
  const claimedRelease = (await sql(reviewer, `SELECT public.manage_kyc_review_work('next',NULL) AS data`)).rows[0].data;
  if (claimedRelease.submissionId !== releaseSubmission) throw new Error(`dedicated release case was not claimed ${JSON.stringify(claimedRelease)}`);
  const releaseVersion = claimedRelease.reviewVersion;
  const reviewer3Client = await client();
  await claims(reviewer3Client, { sub: reviewer3, role: 'authenticated', aal: 'aal2', permitted: 'true', superAdmin: false });
  try {
    await sql(reviewer3Client, `SELECT public.manage_kyc_review_work('release',$1,$2,NULL)`, [releaseSubmission, releaseVersion]);
    fail('non-super-admin release is fenced', 'call unexpectedly succeeded');
  } catch (e) { ok('non-super-admin release is fenced', e.message); }
  await claims(reviewer3Client, { sub: reviewer3, role: 'authenticated', aal: 'aal2', permitted: 'true', superAdmin: true });
  await sql(admin, `INSERT INTO public.user_roles(user_id,role_id) VALUES ($1,'aaaaaaaa-0000-4000-8000-000000000002')`, [reviewer3]);
  await sql(reviewer3Client, `SELECT public.manage_kyc_review_work('release',$1,$2,NULL)`, [releaseSubmission, releaseVersion]);
  const afterRelease = (await sql(admin, `SELECT assigned_to,review_version FROM public.kyc_submissions WHERE id=$1`, [releaseSubmission])).rows[0];
  if (afterRelease.assigned_to !== null || Number(afterRelease.review_version) !== Number(releaseVersion) + 1) throw new Error(`release did not fence assignment ${JSON.stringify(afterRelease)}`);
  ok('version-matched super-admin release succeeds and increments review version');
  await claims(reviewer3Client, { sub: reviewer3, role: 'authenticated', aal: 'aal2', permitted: 'true', superAdmin: false });
  const reclaimed = (await sql(reviewer3Client, `SELECT public.manage_kyc_review_work('next',NULL) AS data`)).rows[0].data;
  if (reclaimed.submissionId !== releaseSubmission || Number(reclaimed.reviewVersion) !== Number(releaseVersion) + 2) throw new Error(`release case was not reclaimed ${JSON.stringify(reclaimed)}`);
  try {
    await sql(reviewer, `SELECT public.review_kyc_case($1,$2,$3,'reject','document_unreadable',NULL)`, [releaseSubmission, releaseUser, releaseVersion]);
    fail('stale decision after release/reclaim is fenced', 'call unexpectedly succeeded');
  } catch (e) { ok('stale decision after release/reclaim is fenced', e.message); }
  await closeClient(reviewer3Client);
  await closeClient(workerC); await closeClient(workerD);
  await closeClient(reviewer); await closeClient(denied); await closeClient(workerA); await closeClient(workerB); await closeClient(svc); await closeClient(admin);
} catch (e) {
  if (!process.exitCode) process.exitCode = 1;
  console.error(e?.stack ?? e);
} finally {
  for (const c of clients) await c.end().catch(() => {});
  const verificationExitCode = process.exitCode;
  await pg.stop().catch(() => {});
  process.exitCode = verificationExitCode;
  await fs.rm(dbDir, { recursive: true, force: true }).catch(() => {});
}
