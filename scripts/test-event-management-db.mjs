#!/usr/bin/env node
/**
 * Disposable loopback PostgreSQL verification for event guards and vendor
 * change notices. This runner never accepts a remote Supabase/FYP target and
 * never sends email; it only inspects rows queued in the local outbox.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const root = process.cwd();
const env = process.env;
const host = env.EVENT_TEST_PGHOST ?? '127.0.0.1';
const port = Number(env.EVENT_TEST_PGPORT ?? '55439');
const user = env.EVENT_TEST_PGUSER ?? 'postgres';
const password = env.EVENT_TEST_PGPASSWORD ?? 'event-test-only';
const adminDatabase = env.EVENT_TEST_PGDATABASE ?? 'postgres';

const loopbackHosts = new Set(['127.0.0.1', '::1', 'localhost']);
if (!loopbackHosts.has(host)) {
  throw new Error('Refusing event DB test: EVENT_TEST_PGHOST must be loopback.');
}
if (env.EVENT_TEST_DATABASE_URL || env.DATABASE_URL || env.SUPABASE_DB_URL) {
  throw new Error('Refusing event DB test: URL-based or generic database targets are not accepted.');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Refusing event DB test: invalid loopback port.');
}
if (env.EVENT_TEST_COMMERCE_RISK === '1'
  && (!env.EVENT_TEST_GUARANTEES || env.EVENT_TEST_GUARANTEES === 'baseline'
    || !env.EVENT_TEST_SETTLEMENT || env.EVENT_TEST_SETTLEMENT === 'baseline'
    || !env.EVENT_TEST_FILTERS)) {
  throw new Error('Commerce risk verification requires patched event guarantees, settlement and filter fixtures.');
}

const baseConfig = {
  host,
  port,
  user,
  password,
  database: adminDatabase,
  application_name: 'mylawatan-event-test-admin',
};

const safeIdentifier = (value) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Unsafe generated database identifier.');
  return `"${value.replaceAll('"', '""')}"`;
};
// Keep fixed event slots in the future, including after their local closing time.
const fixtureToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fixtureOffset = Date.parse(`${fixtureToday}T00:00:00Z`) + 86_400_000 - Date.parse('2026-10-10T00:00:00Z');
const currentFixtureSql = (text) => env.EVENT_TEST_SETTLEMENT ? text.replace(/2026-10-\d{2}/g, date => new Date(Date.parse(`${date}T00:00:00Z`) + fixtureOffset).toISOString().slice(0, 10)) : text;
const query = (client, text, values = []) => client.query(currentFixtureSql(text), values);

const sqlFile = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function section(source, name) {
  const marker = `-- EVENT_TEST_PHASE: ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Missing event test phase: ${name}`);
  const bodyStart = start + marker.length;
  const next = source.indexOf('-- EVENT_TEST_PHASE:', bodyStart);
  return source.slice(bodyStart, next < 0 ? source.length : next);
}

async function createRoleIfMissing(admin, role) {
  await query(admin, `DO $role$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
      CREATE ROLE ${safeIdentifier(role)} NOLOGIN;
    END IF;
  END $role$;`);
}

async function createDatabase(admin, databaseName) {
  await query(admin, `CREATE DATABASE ${safeIdentifier(databaseName)}`);
}

async function dropDatabase(admin, databaseName) {
  if (!/^mylawatan_event_test_[0-9]+_[0-9]+$/.test(databaseName)) return;
  await query(admin, `DROP DATABASE IF EXISTS ${safeIdentifier(databaseName)} WITH (FORCE)`);
}

async function apply(client, relativePath) {
  await query(client, sqlFile(relativePath));
  console.log(`applied ${path.basename(relativePath)}`);
}

async function installGuestCheckoutLayout(client) {
  // Run the real guest migration's event extraction, excluding unrelated
  // catalogue/food functions not supplied by this bounded test fixture.
  await query(client, `
    CREATE TABLE public.guest_checkout_subjects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),revoked_at timestamptz,expires_at timestamptz NOT NULL);
    ALTER TABLE public.carts ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.carts ADD COLUMN guest_subject_id uuid UNIQUE;
    ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.orders ADD COLUMN guest_subject_id uuid, ADD COLUMN contact_email text, ADD COLUMN contact_name text, ADD COLUMN contact_phone text;
    ALTER TABLE public.checkout_sessions ALTER COLUMN user_id DROP NOT NULL;
    ALTER TABLE public.checkout_sessions ADD COLUMN guest_subject_id uuid;
    CREATE FUNCTION public.customer_is_active_email_verified(p_user uuid) RETURNS boolean LANGUAGE sql AS $$
      SELECT EXISTS(SELECT 1 FROM public.users WHERE id=p_user AND status='active' AND email_verified_at IS NOT NULL);
    $$;
    CREATE FUNCTION public.resolve_user_capability(p_user uuid,p_capability text) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"allowed":true}'::jsonb; $$;
  `);
  let source = sqlFile('supabase/migrations/20261002004602_guest_checkout_transactions.sql');
  source = source.slice(0, source.indexOf(' -- Reuse food-mode validation/persistence')) + 'END; $migration$;';
  source = source.replace(/^ \('public\.prepare_checkout\(.*\n/m, '');
  await query(client, source);
  console.log('installed actual guest event checkout extraction');
}

async function runGuestRefundCompatibility(client) {
  const financial = sqlFile('supabase/migrations/20261002145904_preserve_refund_funding_and_provider_outcomes.sql');
  const request = financial.match(/CREATE OR REPLACE FUNCTION public\.request_order_refund\([\s\S]*?^\$\$;/m)?.[0];
  if (!request) throw new Error('Controlled account refund transaction was not found.');
  await runTransaction(client, 'Guest refund identity, transaction and grants',
    sqlFile('supabase/tests/guest_refund_fixture.sql') + '\n' + request + '\n'
    + sqlFile('supabase/migrations/20261007175430_guest_refund_transaction_compatibility.sql') + '\n'
    + sqlFile('supabase/tests/guest_refund_compatibility.sql'));
}

async function installPrivateCheckoutWrappers(client) {
  await query(client, 'CREATE SCHEMA IF NOT EXISTS app_private; GRANT USAGE ON SCHEMA app_private TO anon,authenticated,service_role;');
  for (const name of ['prepare_event_checkout', 'event_checkout_transaction_core', 'get_public_promotion_campaigns']) {
    const result = await query(client, `SELECT p.oid,pg_get_function_arguments(p.oid) AS args,
      pg_get_function_identity_arguments(p.oid) AS identity_args,p.proargnames
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1`, [name]);
    if (!result.rowCount) continue;
    const fn = result.rows[0];
    await query(client, `ALTER FUNCTION public.${name}(${fn.identity_args}) SET SCHEMA app_private;
      CREATE FUNCTION public.${name}(${fn.args}) RETURNS jsonb LANGUAGE sql SET search_path=public,pg_temp
      AS $$ SELECT app_private.${name}(${fn.proargnames.join(',')}); $$;
      REVOKE ALL ON FUNCTION public.${name}(${fn.identity_args}) FROM PUBLIC,anon,authenticated,service_role;`);
    const roles = name === 'get_public_promotion_campaigns' ? 'anon,authenticated,service_role'
      : name === 'event_checkout_transaction_core' ? 'service_role' : 'authenticated';
    await query(client, `GRANT EXECUTE ON FUNCTION public.${name}(${fn.identity_args}) TO ${roles};`);
  }
  console.log('installed private transaction/public invoker wrapper layout');
}

async function runTransaction(client, label, sql) {
  await query(client, 'BEGIN');
  try {
    await query(client, sql);
    await query(client, 'ROLLBACK');
    console.log(`passed ${label}`);
  } catch (error) {
    await query(client, 'ROLLBACK').catch(() => {});
    throw new Error(`${label} failed: ${error.code ?? 'unknown'} ${error.message}`);
  }
}

async function runConcurrencyCheck(database) {
  const make = (applicationName) => new Client({
    ...baseConfig,
    database,
    application_name: applicationName,
  });
  const editor = make('mylawatan-event-test-editor');
  const checkout = make('mylawatan-event-checkout-b');
  const observer = make('mylawatan-event-test-observer');
  await Promise.all([editor.connect(), checkout.connect(), observer.connect()]);
  try {
    // Isolate this race from the seed commitments so a rejection below
    // proves protection of the concurrently created hold itself.
    await query(editor, `UPDATE public.order_items SET fulfil_status='fulfilled';
      UPDATE public.checkout_reservations SET status='released';`);
    await query(editor, 'BEGIN');
    await query(editor, `SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
      SET LOCAL request.jwt.claim.role='authenticated';
      SELECT public.save_promotion_campaign_location_protected(campaign_id,id,
        jsonb_build_object('name','Main Hall concurrency','address',address,'lat',lat,'lng',lng,
          'startsOn',starts_on,'endsOn',ends_on,'opensAt',opens_at,'closesAt',closes_at),
        updated_at,'Concurrency fixture edit') FROM public.promotion_campaign_locations
        WHERE id='55555555-5555-4555-8555-555555555555';`);
    await query(checkout, 'BEGIN');
    await query(checkout, `SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true)`);
    await query(checkout, `SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
    const pending = query(checkout,
      `SELECT public.prepare_event_checkout(
        '77777777-7777-4777-8777-777777777777'::uuid,
        date '2026-10-10',
        '88888888-8888-4888-8888-888888888888'::uuid,
        1, 'mock_card', 'event-lock-wait', 'event-lock-hash'
      )`);
    let observedWait = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await query(observer, `
        SELECT 1 FROM pg_stat_activity
         WHERE application_name = 'mylawatan-event-checkout-b'
           AND state = 'active'
           AND wait_event_type = 'Lock'
         LIMIT 1`);
      if (result.rowCount > 0) {
        observedWait = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await query(editor, 'COMMIT');
    const checkoutResult = await pending;
    const orderId = checkoutResult.rows[0].prepare_event_checkout.order_id;
    const snapshot = await query(checkout, 'SELECT variant_name FROM public.order_items WHERE order_id=$1', [orderId]);
    if (!snapshot.rows[0]?.variant_name.startsWith('Main Hall concurrency')) throw new Error('checkout used the pre-edit arrangement');
    if (!observedWait) throw new Error('checkout did not wait on the campaign advisory lock');
    // Reverse the order: a new checkout holds the lock until it commits;
    // a moving-address edit must wait and then reject its newly visible hold.
    await query(editor, 'BEGIN');
    await query(editor, `SET LOCAL request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
      SET LOCAL request.jwt.claim.role='authenticated';`);
    const movingEdit = query(editor, `SELECT public.save_promotion_campaign_location_protected(campaign_id,id,
      jsonb_build_object('name',name,'address','A different venue','lat',lat,'lng',lng,
        'startsOn',starts_on,'endsOn',ends_on,'opensAt',opens_at,'closesAt',closes_at),
      updated_at,'Move venue during checkout') FROM public.promotion_campaign_locations
      WHERE id='55555555-5555-4555-8555-555555555555';`).then(() => null, (error) => error);
    let editorWait = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await query(observer, `SELECT 1 FROM pg_stat_activity
        WHERE application_name='mylawatan-event-test-editor' AND state='active' AND wait_event_type='Lock'`);
      if (result.rowCount) { editorWait = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await query(checkout, 'COMMIT');
    const editError = await movingEdit;
    await query(editor, 'ROLLBACK');
    if (!editorWait || editError?.message !== 'location_change_has_reservations') throw new Error('edit did not protect the concurrent checkout hold');
    console.log('passed two-session edit/checkout ordering and new-hold protection');
  } finally {
    await Promise.allSettled([
      query(editor, 'ROLLBACK'),
      query(checkout, 'ROLLBACK'),
    ]);
    await Promise.all([editor.end(), checkout.end(), observer.end()]);
  }
}

async function runBoothConcurrencyCheck(database) {
  const a = new Client({ ...baseConfig, database, application_name: 'event-last-booth-a' });
  const b = new Client({ ...baseConfig, database, application_name: 'event-last-booth-b' });
  const observer = new Client({ ...baseConfig, database });
  await Promise.all([a.connect(), b.connect(), observer.connect()]);
  try {
    await query(a, `SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
      SELECT set_config('mywisata.event_change_reason','Configure concurrent approval fixture',false);
      UPDATE public.promotion_campaign_locations SET max_stalls=2,applications_open=true,
        applications_close_at=clock_timestamp()+interval '1 hour',approvals_close_at=clock_timestamp()+interval '2 hours',
        setup_starts_at=clock_timestamp()+interval '3 hours' WHERE id='55555555-5555-4555-8555-555555555555';
      UPDATE public.promotion_campaign_vendors SET status='changes_requested' WHERE id='66666666-6666-4666-8666-666666666668';
      SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
      SELECT public.resubmit_campaign_vendor_registration('66666666-6666-4666-8666-666666666668','','Concurrent applicant',
        'https://example.test/poster.png','[{"kind":"new","name":"Craft gift","imageUrl":null,"price":12,"dailyQuantity":5,"itemKind":"product"}]');`);
    await query(a, 'BEGIN');
    await query(a, `SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
      SELECT public.review_campaign_vendor_registration_with_stall(id,'approve',NULL,updated_at,'B01')
      FROM public.promotion_campaign_vendors WHERE id='66666666-6666-4666-8666-666666666667';`);
    await query(b, 'BEGIN');
    await query(b, `SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true)`);
    const pending = query(b, `SELECT public.review_campaign_vendor_registration_with_stall(id,'approve',NULL,updated_at,'B02')
      FROM public.promotion_campaign_vendors WHERE id='66666666-6666-4666-8666-666666666668'`).then(() => null, (error) => error);
    let waited = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const state = await query(observer, `SELECT 1 FROM pg_stat_activity WHERE application_name='event-last-booth-b' AND wait_event_type='Lock'`);
      if (state.rowCount) { waited = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await query(a, 'COMMIT');
    const error = await pending;
    await query(b, 'ROLLBACK');
    const state = await query(observer, `SELECT count(*)::integer occupied FROM public.promotion_campaign_vendors
      WHERE event_location_id='55555555-5555-4555-8555-555555555555' AND status='approved'`);
    if (!waited || error?.message !== 'event_capacity_full' || state.rows[0].occupied !== 2) throw new Error('Concurrent approvals overallocated the final booth');
    const notices = await query(observer, `SELECT count(*)::integer n FROM public.email_outbox WHERE payload->'eventChange'->>'kind'='approval'`);
    if (notices.rows[0].n !== 1) throw new Error('Failed concurrent approval queued an owner notice');
    console.log('passed two-session last-booth approval and notice rollback');
  } finally {
    await Promise.allSettled([query(a, 'ROLLBACK'), query(b, 'ROLLBACK')]);
    await Promise.all([a.end(), b.end(), observer.end()]);
  }
}

async function runSettlementRefundConcurrency(database) {
  const a = new Client({ ...baseConfig, database, application_name: 'event-settlement-refund-a' });
  const b = new Client({ ...baseConfig, database, application_name: 'event-settlement-clear-b' });
  const observer = new Client({ ...baseConfig, database });
  await Promise.all([a.connect(), b.connect(), observer.connect()]);
  const order = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  try {
    await query(a, `SELECT set_config('request.jwt.claim.role','service_role',false)`);
    await query(a, `UPDATE public.order_items SET fulfil_status='fulfilled',fulfilled_at=now() WHERE order_id=$1`, [order]);
    await query(a, `SELECT public.settle_order_vendor_earnings($1)`, [order]);
    await query(a, `UPDATE public.order_settlements SET hold_until=now()-interval '1 day' WHERE order_id=$1`, [order]);
    await query(a, 'BEGIN');
    await query(a, `SELECT id FROM public.orders WHERE id=$1 FOR UPDATE`, [order]);
    const refund = await query(a, `INSERT INTO public.refunds(order_id,payment_id,amount,status,reason) SELECT $1,id,12,'pending','Concurrent refund before clearing' FROM public.payments WHERE order_id=$1 LIMIT 1 RETURNING id`, [order]);
    const clearing = query(b, `SELECT * FROM public.clear_matured_vendor_settlements(false)`);
    let blocked = false;
    for (let n = 0; n < 40; n += 1) {
      const state = await query(observer, `SELECT 1 FROM pg_stat_activity WHERE application_name='event-settlement-clear-b' AND wait_event_type='Lock'`);
      if (state.rowCount) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await query(a, 'COMMIT');
    await clearing;
    if (!blocked) throw new Error('Clearer did not serialize with refund order lock');
    const settled = await query(observer, `SELECT status FROM public.order_settlements WHERE order_id=$1`, [order]);
    if (settled.rows[0]?.status !== 'pending') throw new Error('Concurrent refund funds became spendable');
    await query(a, `DELETE FROM public.refunds WHERE id=$1`, [refund.rows[0].id]);
    console.log('passed two-session refund/settlement clearance ordering');
  } finally {
    await Promise.allSettled([query(a, 'ROLLBACK'), query(b, 'ROLLBACK')]);
    await Promise.all([a.end(), b.end(), observer.end()]);
  }
}

async function runRefundPickupConcurrency(database) {
  const a = new Client({ ...baseConfig, database, application_name: 'event-refund-review-a' });
  const b = new Client({ ...baseConfig, database, application_name: 'event-pickup-review-b' });
  const observer = new Client({ ...baseConfig, database });
  await Promise.all([a.connect(), b.connect(), observer.connect()]);
  const waitForLock = async (name) => {
    for (let n = 0; n < 40; n += 1) {
      const state = await query(observer, `SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'`, [name]);
      if (state.rowCount) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Expected concurrent order-lock wait did not occur');
  };
  try {
    await query(a, `SELECT set_config('request.jwt.claim.role','service_role',false);`);
    await query(b, `SELECT set_config('request.jwt.claim.role','service_role',false);`);
    const seed = await query(a, `SELECT oi.id,oi.order_id,oi.vendor_id,oi.event_location_id,oi.pickup_slot_id,p.id payment_id
      FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id JOIN public.payments p ON p.order_id=o.id
      WHERE oi.event_location_id IS NOT NULL AND lower(o.status)='paid' ORDER BY oi.id LIMIT 1`);
    const row = seed.rows[0];
    await query(a, `UPDATE public.order_items SET fulfil_status='pending',fulfilled_at=NULL,
      pickup_date=(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,slot_starts_at=now()-interval '1 minute' WHERE id=$1`, [row.id]);
    const refund = (await query(a, `INSERT INTO public.refunds(order_id,payment_id,amount,status,reason)
      VALUES($1,$2,12,'pending','Concurrency review fixture') RETURNING id`, [row.order_id,row.payment_id])).rows[0].id;
    const version = async () => (await query(observer, `SELECT public.get_event_refund_evidence($1)->>'version' v`, [refund])).rows[0].v;
    await query(observer, `SELECT set_config('request.jwt.claim.role','service_role',false)`);
    let token = await version();
    await query(a, 'BEGIN');
    await query(a, `SELECT public.claim_event_refund_review($1,'00000000-0000-0000-0000-000000000001',$2,'Verified review fixture')`, [refund,token]);
    const scan = query(b, `SELECT public.fulfil_event_pickup($1,$2,$3,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,$4,'00000000-0000-0000-0000-000000000002')`,
      [row.order_id,row.vendor_id,row.event_location_id,row.pickup_slot_id]).then(() => null, (error) => error);
    await waitForLock('event-pickup-review-b');
    await query(a, 'COMMIT');
    if ((await scan)?.message !== 'event_refund_under_review') throw new Error('Scan crossed the claimed refund boundary');
    await query(a, `UPDATE public.refunds SET review_claimed_at=NULL,review_claimed_by=NULL,review_evidence_version=NULL WHERE id=$1`,[refund]);
    token = await version();
    await query(a, 'BEGIN');
    await query(a, `SELECT public.fulfil_event_pickup($1,$2,$3,(now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date,$4,'00000000-0000-0000-0000-000000000002')`,
      [row.order_id,row.vendor_id,row.event_location_id,row.pickup_slot_id]);
    const review = query(b, `SELECT public.claim_event_refund_review($1,'00000000-0000-0000-0000-000000000001',$2,'Collected review fixture')`, [refund,token]).then(() => null, (error) => error);
    await waitForLock('event-pickup-review-b');
    await query(a, 'COMMIT');
    if ((await review)?.message !== 'refund_evidence_changed') throw new Error('Stale review survived concurrent pickup');
    console.log('passed two-session refund-first and pickup-first evidence boundaries');
  } finally {
    await Promise.allSettled([query(a, 'ROLLBACK'),query(b, 'ROLLBACK')]);
    await Promise.all([a.end(),b.end(),observer.end()]);
  }
}

const database = `mylawatan_event_test_${process.pid}_${Date.now()}`;
const keepDatabase = env.EVENT_TEST_KEEP_DB === '1';
const admin = new Client(baseConfig);
let dbClient;
try {
  await admin.connect();
  for (const role of ['anon', 'authenticated', 'service_role']) await createRoleIfMissing(admin, role);
  await createDatabase(admin, database);
  dbClient = new Client({ ...baseConfig, database, application_name: 'mylawatan-event-test-runner' });
  await dbClient.connect();

  await apply(dbClient, 'supabase/migrations/20260711160345_create_marketplace_schema.sql');
  await apply(dbClient, 'supabase/tests/event_management_fixture.sql');
  for (const filename of [
    '20260925143000_promotion_campaigns.sql',
    '20260928180000_vendor_fair_event_participation.sql',
    '20260930190000_event_locations.sql',
    '20260930210000_event_listings.sql',
    '20261001090000_event_reservations.sql',
    '20261001120000_event_pickup_fulfilment.sql',
    '20261001150000_event_cancellations.sql',
  ]) {
    await apply(dbClient, `supabase/migrations/${filename}`);
  }

  const guardSql = sqlFile('supabase/tests/event_management_guards.sql');
  const noticeSql = sqlFile('supabase/tests/event_vendor_change_notices.sql');
  await query(dbClient, section(guardSql, 'seed'));
  await runTransaction(dbClient, 'baseline hours-shrink reproduction', section(guardSql, 'baseline'));

  if (env.EVENT_TEST_REFUNDS === '1') await runGuestRefundCompatibility(dbClient);
  if (env.EVENT_TEST_CHECKOUT_LAYOUT === 'guest' || env.EVENT_TEST_CHECKOUT_LAYOUT === 'private_guest') {
    await installGuestCheckoutLayout(dbClient);
  }
  if (env.EVENT_TEST_CHECKOUT_LAYOUT === 'private_guest') await installPrivateCheckoutWrappers(dbClient);

  await apply(dbClient, 'supabase/migrations/20261007034900_event_management_guards.sql');
  await apply(dbClient, 'supabase/migrations/20261007034901_event_vendor_change_notices.sql');

  await runTransaction(dbClient, 'event management guards', section(guardSql, 'patched'));
  await runTransaction(dbClient, 'vendor change notices', noticeSql);
  await runConcurrencyCheck(database);
  if (env.EVENT_TEST_CHECKOUT_LAYOUT === 'guest' || env.EVENT_TEST_CHECKOUT_LAYOUT === 'private_guest') {
    await runTransaction(dbClient, 'guest ownership and protected transaction delegation', `
      SET LOCAL request.jwt.claim.role='service_role';
      DO $$ DECLARE err text; guest_id uuid; result jsonb; BEGIN
        BEGIN PERFORM public.guest_prepare_event_checkout(
          '77777777-7777-4777-8777-777777777777',date '2026-10-10','88888888-8888-4888-8888-888888888888',
          1,'mock_card','bad-guest','fixture',gen_random_uuid(),'{"email":"guest@example.test"}');
        EXCEPTION WHEN OTHERS THEN err:=SQLERRM; END;
        IF err IS DISTINCT FROM 'checkout_not_owned' THEN RAISE EXCEPTION 'guest owner check lost: %',err; END IF;
        INSERT INTO public.guest_checkout_subjects(expires_at) VALUES(now()+interval '1 day') RETURNING id INTO guest_id;
        result:=public.guest_prepare_event_checkout(
          '77777777-7777-4777-8777-777777777777',date '2026-10-10','88888888-8888-4888-8888-888888888888',
          1,'mock_card','valid-guest','fixture',guest_id,'{"email":"guest@example.test"}');
        IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=(result->>'order_id')::uuid
          AND user_id IS NULL AND guest_subject_id=guest_id AND contact_email='guest@example.test') THEN
          RAISE EXCEPTION 'valid guest ownership snapshot lost'; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE p.proname='event_checkout_transaction_core' AND n.nspname IN ('public','app_private')
          AND position('validate_checkout_subject' IN p.prosrc)>0 AND position('assert_event_location_open' IN p.prosrc)>0) THEN
          RAISE EXCEPTION 'guest core ownership or location guard absent'; END IF;
      END; $$;
    `);
  }
  console.log('event management DB verification passed');
  if (env.EVENT_TEST_GUARANTEES) {
    await apply(dbClient, 'supabase/migrations/20261006174844_event_pickup_slot_time_validation.sql');
    await apply(dbClient, 'supabase/tests/event_checkout_finance_fixture.sql');
    await apply(dbClient, 'supabase/tests/event_checkout_baseline.sql');
    await apply(dbClient, 'supabase/migrations/20261002145904_preserve_refund_funding_and_provider_outcomes.sql');
    if (env.EVENT_TEST_GUARANTEES !== 'baseline') await apply(dbClient, 'supabase/migrations/20261011171225_event_checkout_commitment_guards.sql');
    await runTransaction(dbClient, 'late-payment commitments', sqlFile('supabase/tests/event_checkout_commitments.sql'));
    if (env.EVENT_TEST_GUARANTEES !== 'baseline') {
      await apply(dbClient, 'supabase/migrations/20261011171233_event_reservation_change_guards.sql');
    }
    await runTransaction(dbClient, 'reservation edit protections', sqlFile('supabase/tests/event_reservation_edit_guards.sql'));
    await runTransaction(dbClient, 'shortage impact and confirmation', sqlFile('supabase/tests/event_shortage_resolution.sql'));
    if (env.EVENT_TEST_GUARANTEES !== 'baseline') await apply(dbClient, 'supabase/migrations/20261011171242_event_refund_review_evidence.sql');
    await runTransaction(dbClient, 'refund evidence review', sqlFile('supabase/tests/event_refund_review_evidence.sql'));
    if (env.EVENT_TEST_GUARANTEES !== 'baseline') await apply(dbClient, 'supabase/migrations/20261011171247_event_reservation_operations.sql');
    await runTransaction(dbClient, 'exception ownership and closure', sqlFile('supabase/tests/event_reservation_operations.sql'));
    if (env.EVENT_TEST_FILTERS) {
      await apply(dbClient, 'supabase/migrations/20261011171300_event_exception_query_filters.sql');
      await runTransaction(dbClient, 'exception filtering and pagination', sqlFile('supabase/tests/event_exception_query_filters.sql'));
    }
    if (env.EVENT_TEST_SETTLEMENT) {
      await query(dbClient, 'ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS pending_earnings_sen bigint NOT NULL DEFAULT 0;');
      await apply(dbClient, 'supabase/migrations/20260911000000_vendor_order_settlement.sql');
      await query(dbClient, 'ALTER TABLE public.order_settlements ADD COLUMN is_simulated boolean NOT NULL DEFAULT false;');
      if (env.EVENT_TEST_SETTLEMENT !== 'baseline') {
        await apply(dbClient, 'supabase/migrations/20261011194020_event_settlement_pickup_resolution.sql');
        await query(dbClient, sqlFile('supabase/tests/event_refund_resolution_backfill_fixture.sql'));
        console.log('installed legacy processed-refund resolution fixture');
        await apply(dbClient, 'supabase/migrations/20261029045138_affiliate_refund_resolution_code.sql');
      }
      await runTransaction(dbClient, 'event settlement and overdue pickup resolution', sqlFile('supabase/tests/event_settlement_pickup_resolution.sql'));
      if (env.EVENT_TEST_SETTLEMENT !== 'baseline') await runSettlementRefundConcurrency(database);
      if (env.EVENT_TEST_VENDOR_NOTICES) {
        await query(dbClient, 'ALTER TABLE public.email_outbox ADD COLUMN IF NOT EXISTS last_error text;');
        if (env.EVENT_TEST_VENDOR_NOTICES !== 'baseline') await apply(dbClient, 'supabase/migrations/20261012013400_event_exception_vendor_notices.sql');
        await runTransaction(dbClient, 'vendor exception notices', sqlFile('supabase/tests/event_exception_vendor_notices.sql'));
      }
    }
    await runRefundPickupConcurrency(database);
  }
  if (env.EVENT_TEST_INTAKE) {
    if (env.EVENT_TEST_INTAKE !== 'baseline') await apply(dbClient, 'supabase/migrations/20261007161233_event_booth_allocation_and_intake.sql');
    await runTransaction(dbClient, 'booth allocation and intake', sqlFile('supabase/tests/event_booth_allocation_and_intake.sql'));
    if (env.EVENT_TEST_INTAKE !== 'baseline') await runBoothConcurrencyCheck(database);
  }
  if (env.EVENT_TEST_BUYER_GUARDS === '1') {
    if (!env.EVENT_TEST_GUARANTEES || env.EVENT_TEST_CHECKOUT_LAYOUT !== 'guest') throw new Error('Buyer guards require guarantees and Guest fixture layout');
    const { verifyCheckoutEligibility } = await import('./lib/checkout-eligibility-db.mjs');
    await verifyCheckoutEligibility({ db: dbClient, query, config: { ...baseConfig, database } });
  }
  if (env.EVENT_TEST_COMMERCE_RISK === '1') {
    const { verifyCommerceRisk } = await import('./lib/commerce-risk-db.test.mjs');
    await verifyCommerceRisk({ db: dbClient, query });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (dbClient) await dbClient.end().catch(() => {});
  if (keepDatabase) {
    console.log(`kept local disposable DB: ${database}`);
  } else {
    await dropDatabase(admin, database).catch((error) => {
      console.error(`local disposable DB cleanup failed: ${error.message}`);
      process.exitCode = 1;
    });
  }
  await admin.end().catch(() => {});
}
