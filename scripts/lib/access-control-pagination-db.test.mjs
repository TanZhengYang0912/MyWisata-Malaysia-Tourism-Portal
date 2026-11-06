// Disposable PostgreSQL replay for the new Access Control read projections.
// Run with: npm exec --yes --package=@electric-sql/pglite -- node scripts/lib/access-control-pagination-db.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const packagePath = (process.env.PATH ?? '').split(path.delimiter)
  .map((directory) => path.resolve(directory, '../@electric-sql/pglite/dist/index.js'))
  .find((file) => fs.existsSync(file));
if (!packagePath) throw new Error('Run with npm exec --yes --package=@electric-sql/pglite -- node scripts/lib/access-control-pagination-db.test.mjs');
const { PGlite } = await import(pathToFileURL(packagePath).href);
const db = new PGlite();
const migration = fs.readFileSync('supabase/migrations/20261106093323_bound_admin_access_control_reads.sql', 'utf8');

await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE SCHEMA app_private;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claims', true)::jsonb $$;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (auth.jwt()->>'sub')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
  CREATE TABLE public.users(id uuid PRIMARY KEY, full_name text, display_name text, email text);
  CREATE TABLE public.roles(id uuid PRIMARY KEY, name text);
  CREATE TABLE public.user_roles(user_id uuid, role_id uuid, vendor_id uuid, outlet_id uuid);
  CREATE TABLE public.capabilities(key text PRIMARY KEY, category text, risk_level text, enabled boolean, customer_visible boolean, manually_assignable boolean);
  CREATE TABLE public.entitlement_policies(id uuid PRIMARY KEY, key text, capability_key text, name text, scope text, created_at timestamptz DEFAULT now());
  CREATE TABLE public.entitlement_policy_versions(id uuid PRIMARY KEY, policy_id uuid, version integer, status text, effect text, effective_from timestamptz, effective_until timestamptz, created_by uuid, approved_by uuid, created_at timestamptz DEFAULT now(), activated_at timestamptz);
  CREATE TABLE public.entitlement_policy_requirements(id uuid DEFAULT gen_random_uuid(), policy_version_id uuid, alternative_group integer, fact_key text);
  CREATE TABLE public.entitlement_policy_approvals(id uuid DEFAULT gen_random_uuid(), policy_version_id uuid, created_at timestamptz DEFAULT now());
  CREATE TABLE public.entitlement_assignments(id uuid PRIMARY KEY, subject_type text, subject_id text, capability_key text, effect text, starts_at timestamptz, expires_at timestamptz, reason text, granted_by uuid, revoked_by uuid, revoked_at timestamptz, created_at timestamptz DEFAULT now());
  CREATE FUNCTION public.require_entitlement_super_admin() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN IF auth.role()<>'authenticated' OR NOT EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=auth.uid() AND ur.vendor_id IS NULL AND ur.outlet_id IS NULL AND r.name='super_admin') THEN RAISE EXCEPTION 'super_admin_required'; END IF; END $$;
  CREATE FUNCTION public.current_entitlement_generation() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT 7::bigint $$;
  GRANT USAGE ON SCHEMA public, auth, app_private TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.require_entitlement_super_admin(), public.current_entitlement_generation() TO authenticated;
  INSERT INTO public.users VALUES('11111111-1111-4111-8111-111111111111','Admin','Admin','admin@example.test');
  INSERT INTO public.roles VALUES('22222222-2222-4222-8222-222222222222','super_admin');
  INSERT INTO public.user_roles VALUES('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',NULL,NULL);
  INSERT INTO public.capabilities(key,category,risk_level,enabled,customer_visible,manually_assignable)
    SELECT 'cap.'||n,'platform','low',true,true,true FROM generate_series(1,61) n;
  INSERT INTO public.capabilities VALUES('cap.hidden','platform','high',false,false,false);
  INSERT INTO public.entitlement_policies VALUES('33333333-3333-4333-8333-333333333333','policy.test','cap.1','Policy','customer',now());
  INSERT INTO public.entitlement_policy_versions(id,policy_id,version,status,effect)
    SELECT gen_random_uuid(),'33333333-3333-4333-8333-333333333333',n,'active','allow' FROM generate_series(1,30) n;
`);
await db.exec(migration);

const setIdentity = async (role, sub = '11111111-1111-4111-8111-111111111111') => {
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role, sub })]);
};
await setIdentity('authenticated');
await db.exec('SET ROLE authenticated');
const first = (await db.query("SELECT public.list_access_control_capabilities(1,25,'cap.') AS result")).rows[0].result;
assert.equal(first.total, 62);
assert.equal(first.items.length, 25);
assert.equal(first.items[0].key, 'cap.1');
assert.equal(first.generation, 7);
const third = (await db.query("SELECT public.list_access_control_capabilities(3,25,'cap.') AS result")).rows[0].result;
assert.equal(third.items.length, 12);
assert.equal(third.totalPages, 3);
const wildcardLiteral = (await db.query("SELECT public.list_access_control_capabilities(1,25,'_%') AS result")).rows[0].result;
assert.equal(wildcardLiteral.total, 0, 'search metacharacters are literal');
await assert.rejects(db.query("SELECT public.list_access_control_capabilities(1,24,'')"), /invalid_access_control_query/);
const overview = (await db.query('SELECT public.get_access_control_overview() AS result')).rows[0].result;
assert.equal(overview.counts.capabilities, 62);
const versions = (await db.query("SELECT public.list_access_control_policy_versions('33333333-3333-4333-8333-333333333333',10,NULL) AS result")).rows[0].result;
assert.equal(versions.items.length, 10);
assert.equal(versions.hasMore, true);
assert.equal(versions.nextCursor, 21);
await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'authenticated', sub: '99999999-9999-4999-8999-999999999999' })]);
await assert.rejects(db.query('SELECT public.get_access_control_generation()'), /super_admin_required/);
await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: 'service_role', sub: '11111111-1111-4111-8111-111111111111' })]);
await db.exec('SET ROLE service_role');
await assert.rejects(db.query('SELECT public.get_access_control_generation()'), /permission denied/);
await db.exec('RESET ROLE');
const queryPlan = (await db.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
  SELECT key FROM public.capabilities
  WHERE (COALESCE(btrim('cap.'),'')='' OR position(lower(btrim('cap.')) IN lower(key))>0)
  ORDER BY key LIMIT 25 OFFSET 25`)).rows[0]['QUERY PLAN'][0];
assert.equal(queryPlan.Plan['Actual Rows'], 25, 'database-side pagination plan returns only one page');
console.log(`Access Control EXPLAIN: ${queryPlan.Plan['Node Type']}; returned=${queryPlan.Plan['Actual Rows']}; executionMs=${queryPlan['Execution Time']}; sharedHits=${queryPlan.Plan['Shared Hit Blocks'] ?? 0}; sharedReads=${queryPlan.Plan['Shared Read Blocks'] ?? 0}`);
await db.close();
console.log('Access Control PostgreSQL replay passed: bounded pages, literal search, totals, policy cursor, generation and authorization.');
