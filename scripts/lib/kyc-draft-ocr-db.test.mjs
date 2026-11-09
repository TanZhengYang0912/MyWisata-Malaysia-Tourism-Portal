// Disposable in-memory PostgreSQL-compatible checks for the new KYC draft OCR RPCs.
// Run with: npm exec --yes --package=@electric-sql/pglite -- node scripts/lib/kyc-draft-ocr-db.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packagePath = (process.env.PATH ?? '').split(path.delimiter)
  .map((directory) => path.resolve(directory, '../@electric-sql/pglite/dist/index.js'))
  .find((file) => fs.existsSync(file));
if (!packagePath) throw new Error('Run with npm exec --yes --package=@electric-sql/pglite -- node scripts/lib/kyc-draft-ocr-db.test.mjs');
const { PGlite } = await import(pathToFileURL(packagePath).href);
const db = new PGlite();
const migrationPath = path.resolve('supabase/migrations/20261109042323_kyc_clean_ocr_and_manual_confirmation.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const owner = '11111111-1111-4111-8111-111111111111';
const draft = '22222222-2222-4222-8222-222222222222';
const fingerprint = 'a'.repeat(64);
const operationA = '33333333-3333-4333-8333-333333333333';
const operationB = '44444444-4444-4444-8444-444444444444';
const operationC = '55555555-5555-4555-8555-555555555555';
const operationD = '66666666-6666-4666-8666-666666666666';
const operationE = '77777777-7777-4777-8777-777777777777';
const currentPath = `${owner}/drafts/${draft}/staging/${operationA}/front.jpg`;
const retiredPath = `${owner}/drafts/${draft}/retired/old-front.jpg`;

function definition(signature) {
  const start = migration.indexOf(`CREATE FUNCTION ${signature}`);
  assert.notEqual(start, -1, `migration contains ${signature}`);
  const end = migration.indexOf('$$;', start);
  assert.notEqual(end, -1, `${signature} has a closed SQL body`);
  return migration.slice(start, end + 3);
}

function statement(prefix) {
  const start = migration.indexOf(prefix);
  assert.notEqual(start, -1, `migration contains ${prefix}`);
  const end = migration.indexOf(';', start);
  assert.notEqual(end, -1, `${prefix} ends with a semicolon`);
  return migration.slice(start, end + 1);
}

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA app_private;
    GRANT USAGE ON SCHEMA public,auth,app_private TO anon,authenticated,service_role;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')
    $$;
    CREATE TABLE public.users(id uuid PRIMARY KEY,status text NOT NULL);
    CREATE TABLE app_private.kyc_drafts(
      id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,state text NOT NULL,version bigint NOT NULL,
      expires_at timestamptz NOT NULL,absolute_expires_at timestamptz NOT NULL,
      front_storage_path text,back_storage_path text,retired_storage_paths text[] NOT NULL DEFAULT '{}'
    );
    CREATE TABLE app_private.kyc_operations(
      id uuid PRIMARY KEY,owner_user_id uuid NOT NULL,kind text NOT NULL,request_fingerprint text NOT NULL,
      draft_id uuid,expected_version bigint,state text NOT NULL,lease_token uuid,lease_expires_at timestamptz,
      safe_error_code text,staging_storage_paths text[] NOT NULL DEFAULT '{}',result_reference jsonb,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT kyc_operations_kind_check CHECK(kind IN ('submit','withdraw','review','resolve'))
    );
    CREATE TABLE app_private.kyc_draft_cleanup_orphans(owner_user_id uuid NOT NULL,storage_path text PRIMARY KEY);
    INSERT INTO public.users(id,status) VALUES('${owner}','active');
    INSERT INTO app_private.kyc_drafts(id,owner_user_id,state,version,expires_at,absolute_expires_at,
      front_storage_path,retired_storage_paths)
    VALUES('${draft}','${owner}','editing',4,now()+interval '1 hour',now()+interval '1 day',
      '${currentPath}',ARRAY['${retiredPath}']);
  `);

  const privateClaim = 'app_private.claim_kyc_draft_ocr_operation(';
  const publicClaim = 'public.claim_kyc_draft_ocr_operation(';
  const privateReference = 'app_private.is_kyc_draft_storage_path_referenced(';
  const publicReference = 'public.is_kyc_draft_storage_path_referenced(';
  for (const sql of [
    statement('ALTER TABLE app_private.kyc_operations DROP CONSTRAINT IF EXISTS kyc_operations_kind_check'),
    statement('ALTER TABLE app_private.kyc_operations ADD CONSTRAINT kyc_operations_kind_check'),
    definition(privateReference),
    definition(publicReference),
    definition(privateClaim),
    definition(publicClaim),
    statement(`REVOKE ALL ON FUNCTION ${privateReference}`),
    statement(`GRANT EXECUTE ON FUNCTION ${privateReference}`),
    statement(`REVOKE ALL ON FUNCTION ${publicReference}`),
    statement(`GRANT EXECUTE ON FUNCTION ${publicReference}`),
    statement(`REVOKE ALL ON FUNCTION ${privateClaim}`),
    statement(`GRANT EXECUTE ON FUNCTION ${privateClaim}`),
    statement(`REVOKE ALL ON FUNCTION ${publicClaim}`),
    statement(`GRANT EXECUTE ON FUNCTION ${publicClaim}`),
  ]) await db.exec(sql);

  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role' })]);
  await db.exec('SET ROLE service_role');
  const claim = async (operationId, expectedVersion = 4, requestFingerprint = fingerprint) => (await db.query(
    'SELECT public.claim_kyc_draft_ocr_operation($1,$2,$3,$4,$5) AS result',
    [operationId, owner, draft, expectedVersion, requestFingerprint],
  )).rows[0].result;

  const first = await claim(operationA);
  assert.equal(first.status, 'claimed');
  assert.match(first.leaseToken, /^[0-9a-f-]{36}$/i);
  const concurrentDuplicate = await claim(operationB);
  assert.deepEqual(concurrentDuplicate, { status: 'processing', duplicate: true });

  await db.exec('RESET ROLE');
  await db.query("UPDATE app_private.kyc_operations SET state='succeeded' WHERE id=$1", [operationA]);
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role' })]);
  await db.exec('SET ROLE service_role');
  assert.deepEqual(await claim(operationC), { status: 'succeeded', duplicate: true });

  await db.exec('RESET ROLE');
  await db.query("UPDATE app_private.kyc_operations SET state='failed' WHERE id=$1", [operationA]);
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role' })]);
  await db.exec('SET ROLE service_role');
  assert.equal((await claim(operationD)).status, 'claimed', 'a failed snapshot can be retried with a fresh operation ID');

  const currentReference = (await db.query('SELECT public.is_kyc_draft_storage_path_referenced($1) AS referenced', [currentPath])).rows[0].referenced;
  const retiredReference = (await db.query('SELECT public.is_kyc_draft_storage_path_referenced($1) AS referenced', [retiredPath])).rows[0].referenced;
  const unknownReference = (await db.query('SELECT public.is_kyc_draft_storage_path_referenced($1) AS referenced', ['unrelated/path.jpg'])).rows[0].referenced;
  assert.equal(currentReference, true, 'a live current document side is retained');
  assert.equal(retiredReference, true, 'a retired document side remains protected until draft cleanup releases it');
  assert.equal(unknownReference, false, 'unreferenced paths remain eligible for bounded cleanup');

  await db.exec('RESET ROLE');
  await db.query("UPDATE app_private.kyc_drafts SET expires_at=now()-interval '1 second' WHERE id=$1", [draft]);
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role' })]);
  await db.exec('SET ROLE service_role');
  await assert.rejects(claim(operationE), /kyc_draft_conflict/);

  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated' })]);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(claim(operationE), /permission denied/);
  await assert.rejects(db.query('SELECT public.is_kyc_draft_storage_path_referenced($1)', [currentPath]), /permission denied/);
  await db.exec('RESET ROLE');

  console.log('KYC draft OCR PGlite checks passed: migration RPC syntax, role boundary, exact-snapshot deduplication, retry, draft expiry guard, and current/retired path protection.');
} finally {
  await db.close();
}
