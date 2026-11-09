// Disposable PostgreSQL replay for ticket-bound service-role KYC operations.
// Run with: npm exec --yes --package=@electric-sql/pglite -- node scripts/lib/kyc-jit-operation-ticket-db.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packagePath = (process.env.PATH ?? '').split(path.delimiter)
  .map((directory) => path.resolve(directory, '../@electric-sql/pglite/dist/index.js'))
  .find((file) => fs.existsSync(file));
if (!packagePath) throw new Error('Run with npm exec --yes --package=@electric-sql/pglite -- node scripts/lib/kyc-jit-operation-ticket-db.test.mjs');
const { PGlite } = await import(pathToFileURL(packagePath).href);
const db = new PGlite();
const actor = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const submission = '33333333-3333-4333-8333-333333333333';
const secondary = '99999999-9999-4999-8999-999999999999';
const secondarySession = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE SCHEMA app_private;
  CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL,not_after timestamptz);
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claims',true)::jsonb $$;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
  CREATE TABLE public.users(id uuid PRIMARY KEY,status text,full_name text DEFAULT NULL);
  CREATE TABLE public.roles(id uuid PRIMARY KEY,name text);
  CREATE TABLE public.user_roles(user_id uuid,role_id uuid,vendor_id uuid,outlet_id uuid);
  CREATE TABLE public.staff_role_assignments(id uuid,user_id uuid,role_id uuid,revoked_at timestamptz);
  CREATE TABLE public.staff_roles(id uuid,is_active boolean,is_system boolean,updated_at timestamptz);
  CREATE TABLE public.staff_role_modules(role_id uuid,module_id uuid);
  CREATE TABLE public.staff_modules(id uuid,is_active boolean);
  CREATE TABLE public.staff_module_permissions(module_id uuid,permission_id uuid);
  CREATE TABLE public.staff_permissions(id uuid,key text);
  CREATE TABLE public.staff_role_jit_permissions(role_id uuid,permission_id uuid);
  CREATE TABLE public.staff_module_legacy_roles(module_id uuid,role_name text,grants_permissions boolean);
  CREATE TABLE public.kyc_submissions(id uuid PRIMARY KEY,user_id uuid,status text,review_version bigint,assigned_to uuid);
  CREATE TABLE public.kyc_submission_documents(submission_id uuid,side text,storage_path text,purge_claimed_at timestamptz);
  CREATE TABLE public.audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid,action text,entity_type text,entity_id uuid,after_data jsonb);
  CREATE TABLE public.kyc_revision_fixture(submission_id uuid PRIMARY KEY,revision text);
  CREATE TABLE app_private.staff_jit_requests(id uuid,user_id uuid,session_id uuid,permission_key text,state text,activated_at timestamptz,expires_at timestamptz,assignment_id uuid,role_id uuid,role_updated_at timestamptz);
  CREATE TABLE app_private.kyc_identity_resolutions(id uuid,related_case_id uuid,version bigint,status text,proposal jsonb,primary_actor_id uuid,secondary_actor_id uuid);
  CREATE TABLE app_private.kyc_review_confirmations(
    id uuid,actor_id uuid,expected_actor_id uuid,session_id uuid,attested_aal text,submission_id uuid,review_version bigint,evidence_revision text,
    actual_document_type text,issuer_country text,identifier_kind text,confirmed_holder_name text,confirmed_number_hmac text,hash_version text,source text,
    observation_id uuid,document_access_refs uuid[],reason_code text,reason_detail text,risk_level text,purpose text,resolution_id uuid,
    resolution_version bigint,proposal_digest text,resolution_actor_role text,created_at timestamptz,attested_at timestamptz,expires_at timestamptz,
    consumed_at timestamptz,consumed_xid bigint,invalidated_at timestamptz
  );
  CREATE TABLE app_private.kyc_review_countersign_authorizations(
    submission_id uuid,review_version bigint,evidence_revision text,primary_actor_id uuid,secondary_actor_id uuid,expires_at timestamptz,
    authorized_at timestamptz,UNIQUE(submission_id,review_version,evidence_revision,secondary_actor_id)
  );
  CREATE TABLE app_private.kyc_identity_control(singleton boolean,status text,confirmation_ttl_seconds integer);
  CREATE TABLE app_private.kyc_operations(id uuid,owner_user_id uuid,request_fingerprint text,state text);
  CREATE TABLE public.kyc_ocr_results(submission_id uuid,status text,document_number_hmac text,holder_name text);
  CREATE TABLE app_private.kyc_ocr_observations(
    id uuid,context_kind text,context_id uuid,evidence_revision text,document_number_hmac text,holder_name text,actual_document_type text,issuer_country text
  );
  CREATE TABLE app_private.kyc_identity_bindings(
    identity_scope text,hash_version text,document_number_hmac text,owner_user_id uuid,current_verified_submission_id uuid,state text,version bigint,updated_at timestamptz
  );
  CREATE TABLE app_private.kyc_identity_events(
    identity_scope text,hash_version text,document_number_hmac text,submission_id uuid,primary_confirmation_id uuid,
    secondary_confirmation_id uuid,new_owner_user_id uuid,new_state text,actor_ids uuid[],reason_code text
  );
  CREATE FUNCTION app_private.staff_jit_is_eligible(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION app_private.staff_jit_request_is_current(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION app_private.staff_jit_permission_for_current_session(p_user_id uuid,p_permission_key text) RETURNS boolean
    LANGUAGE plpgsql VOLATILE AS $$ BEGIN RETURN EXISTS (SELECT 1 FROM app_private.kyc_service_operation_tickets t
      JOIN app_private.staff_jit_requests r ON r.user_id=t.actor_id AND r.session_id=t.session_id
        AND r.permission_key=p_permission_key AND r.state='active'
      WHERE t.actor_id=p_user_id AND t.consumed_xid=txid_current() AND t.session_id=r.session_id
        AND r.activated_at<=statement_timestamp() AND r.expires_at>statement_timestamp()); END $$;
  CREATE FUNCTION app_private.has_live_kyc_reviewer_session(p_actor uuid,p_session uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT auth.role()='authenticated' AND auth.uid()=p_actor AND auth.jwt()->>'aal'='aal2' AND EXISTS(SELECT 1 FROM auth.sessions WHERE id=p_session AND user_id=p_actor AND (not_after IS NULL OR not_after>now())) $$;
  CREATE FUNCTION app_private.has_kyc_identity_resolution_permission(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION app_private.is_kyc_review_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION app_private.kyc_evidence_revision(p_submission uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT revision FROM public.kyc_revision_fixture WHERE submission_id=p_submission $$;
  CREATE FUNCTION app_private.is_live_kyc_session(p_actor uuid,p_session uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM auth.sessions WHERE id=p_session AND user_id=p_actor AND (not_after IS NULL OR not_after>now())) $$;
  CREATE FUNCTION app_private.check_kyc_document_access(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
  CREATE FUNCTION app_private.get_kyc_review_confirmation_ids(uuid,bigint,text,uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
  CREATE FUNCTION app_private.stage_kyc_identity_confirmation(uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,uuid,uuid[],text,text,text,text,integer) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
  CREATE FUNCTION app_private.stage_kyc_resolution_confirmation(uuid,uuid,uuid,bigint,text,uuid[],text,text,text,text,text,text,integer) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
  CREATE FUNCTION public.get_kyc_document_view_v2(uuid,text,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
  CREATE FUNCTION public.get_kyc_document_view(uuid,text,uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'legacy'::text $$;
  CREATE FUNCTION public.get_kyc_review_confirmation_ids(uuid,bigint,text,uuid,uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
  CREATE FUNCTION public.get_kyc_evidence_revision(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'legacy'::text $$;
  CREATE FUNCTION public.stage_kyc_identity_confirmation(uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,uuid,uuid[],text,text,text,text,integer) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
  CREATE FUNCTION public.stage_kyc_resolution_confirmation(uuid,uuid,uuid,bigint,text,uuid[],text,text,text,text,text,text,integer) RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
  CREATE FUNCTION public.list_kyc_countersign_candidates(p_submission_id uuid,p_expected_version bigint)
    RETURNS TABLE(user_id uuid,display_name text) LANGUAGE plpgsql AS $$ BEGIN
      RETURN QUERY SELECT * FROM app_private.list_kyc_countersign_candidates(p_submission_id,p_expected_version);
    END $$;
  CREATE FUNCTION public.authorize_kyc_countersign(p_submission_id uuid,p_expected_version bigint,p_evidence_revision text,
    p_secondary_actor_id uuid,p_ttl_seconds integer) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      PERFORM app_private.authorize_kyc_countersign(p_submission_id,p_expected_version,p_evidence_revision,p_secondary_actor_id,p_ttl_seconds);
    END $$;
  CREATE FUNCTION public.can_review_kyc(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE FUNCTION app_private.get_kyc_evidence_revision(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'legacy'::text $$;
  GRANT USAGE ON SCHEMA public,auth,app_private TO anon,authenticated,service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon,authenticated,service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private TO anon,authenticated,service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,authenticated,service_role;
  INSERT INTO auth.users VALUES('${actor}'),('${secondary}');
  INSERT INTO auth.sessions VALUES('${session}','${actor}',NULL),('${secondarySession}','${secondary}',NULL);
  INSERT INTO public.users VALUES('${actor}','active'),('${secondary}','active');
  INSERT INTO public.kyc_submissions VALUES('${submission}','55555555-5555-4555-8555-555555555555','pending',7,'${actor}');
  INSERT INTO public.kyc_submission_documents VALUES('${submission}','front','private/front.jpg',NULL);
  INSERT INTO public.kyc_revision_fixture VALUES('${submission}','evidence-v7');
  INSERT INTO app_private.staff_jit_requests(id,user_id,session_id,permission_key,state,activated_at,expires_at,assignment_id,role_id,role_updated_at)
    VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${secondary}','${secondarySession}','admin.kyc.review','active',now()-interval '1 minute',now()+interval '30 minutes','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888',now());
  INSERT INTO app_private.staff_jit_requests(id,user_id,session_id,permission_key,state,activated_at,expires_at,assignment_id,role_id,role_updated_at)
    VALUES('66666666-6666-4666-8666-666666666666','${actor}','${session}','admin.kyc.review','active',now()-interval '1 minute',now()+interval '30 minutes','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888',now());
  INSERT INTO app_private.kyc_identity_control(singleton,status,confirmation_ttl_seconds) VALUES(true,'ready',300);
`);
try {
  await db.exec(fs.readFileSync('supabase/migrations/20261106115747_staff_jit_kyc_operation_tickets.sql', 'utf8'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  throw error;
}

const claims = async (role) => db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role, sub: actor, aal: 'aal2', session_id: session })]);
assert.equal((await db.query('SELECT app_private.kyc_session_has_review_permission($1,$2) AS allowed', [secondary,secondarySession])).rows[0].allowed, true,
  'a second reviewer’s current JIT session remains verifiable during final approval');
assert.equal((await db.query('SELECT app_private.kyc_session_has_review_permission($1,$2) AS allowed', [secondary,session])).rows[0].allowed, false,
  'a JIT permission cannot be borrowed from a different session');
await claims('authenticated');
await db.exec('SET ROLE authenticated');
const candidateRows = (await db.query(
  'SELECT user_id FROM public.list_kyc_countersign_candidates($1,7)', [submission],
)).rows;
assert(candidateRows.some((row) => row.user_id === secondary), `a JIT-only independent reviewer is visible before countersign authorization exists: ${JSON.stringify(candidateRows)}`);
await db.query(
  'SELECT public.authorize_kyc_countersign($1,7,$2,$3,300)', [submission,'evidence-v7',secondary],
);
const issue = async (action, side = null) => (await db.query(
  'SELECT public.issue_kyc_service_operation_ticket($1,$2,7,$3,NULL) AS ticket', [submission, action, side],
)).rows[0].ticket;
const ticket = await issue('document.view', 'front');
await db.exec('RESET ROLE');
await claims('service_role');
await db.exec('SET ROLE service_role');
await assert.rejects(db.query(`SELECT public.get_kyc_document_view_v3($1,'back',$2,7,'evidence-v7')`, [submission, ticket.ticketId]), /kyc_operation_ticket_invalid/);
const document = (await db.query(`SELECT public.get_kyc_document_view_v3($1,'front',$2,7,'evidence-v7') AS value`, [submission, ticket.ticketId])).rows[0].value;
assert.equal(document.storage_path, 'private/front.jpg');
await assert.rejects(db.query(`SELECT public.get_kyc_document_view_v3($1,'front',$2,7,'evidence-v7')`, [submission, ticket.ticketId]), /kyc_operation_ticket_invalid/);
assert.equal((await db.query("SELECT has_function_privilege('service_role','public.get_kyc_document_view(uuid,text,uuid)','EXECUTE') AS allowed")).rows[0].allowed, false,
  'legacy document read RPC must no longer be executable by service_role');
await db.exec('RESET ROLE');
await claims('authenticated');
await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: secondary, aal: 'aal2', session_id: secondarySession })]);
await db.exec('SET ROLE authenticated');
const secondaryTicket = (await db.query(
  "SELECT public.issue_kyc_service_operation_ticket($1,'confirmation.stage',7,NULL,NULL,'independent_second') AS value", [submission],
)).rows[0].value;
assert.equal(typeof secondaryTicket.ticketId, 'string', 'an authorized independent reviewer can obtain a purpose-bound KYC ticket without primary assignment');
await db.exec('RESET ROLE');
await claims('service_role');
await db.exec('SET ROLE service_role');
const stagedSecondary = (await db.query(`SELECT public.stage_kyc_identity_confirmation_with_ticket(
  $1,$2,$3,$4,7,'evidence-v7','national_id','MY','my_ic','Test Holder',$5,'manual',NULL,$6::uuid[],
  'ocr_number_mismatch','independent review','high','independent_second',300) AS id`, [
    secondaryTicket.ticketId,secondary,secondarySession,submission,'a'.repeat(64),
    ['aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa','bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'],
])).rows[0].id;
assert.equal(typeof stagedSecondary, 'string', 'the independent reviewer ticket is consumed and bound to its exact purpose');
await db.exec('RESET ROLE');
await db.close();
console.log('KYC operation-ticket PostgreSQL replay passed: JIT-backed issuance and service consumption, case/side binding, one-time use and legacy RPC revocation.');
