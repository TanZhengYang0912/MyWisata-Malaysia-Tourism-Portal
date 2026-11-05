/** Actual SQL acceptance; called only by the disposable loopback finance harness. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import pg from 'pg';

export async function verifyAffiliateClearing({ db, query }) {
  const sql = (text, values = []) => query(db, text, values);
  assert.ok(['127.0.0.1', '::1', 'localhost'].includes(db.connectionParameters.host));
  await sql(`ALTER TABLE public.affiliate_attributions
    ADD COLUMN IF NOT EXISTS hold_until timestamptz,
    ADD COLUMN IF NOT EXISTS cleared_at timestamptz,
    ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
    ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tier text DEFAULT 'kyc_verified';
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;
    ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS event_location_id uuid;
    ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS pickup_date date;
    ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS provider_failure_code text;
    ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS provider_failure_message text;
    ALTER TABLE public.refunds ADD COLUMN IF NOT EXISTS provider_refund_id text;
    CREATE TABLE IF NOT EXISTS public.event_order_exceptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, kind text NOT NULL,
      state text NOT NULL DEFAULT 'open', resolution_code text
    );
    CREATE TABLE IF NOT EXISTS public.affiliate_guest_commission_reviews (
      attribution_id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'pending',
      evidence_code text NOT NULL DEFAULT 'test', version integer NOT NULL DEFAULT 1,
      decided_by uuid, decided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS public.affiliate_guest_commission_review_events (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, attribution_id uuid, version integer,
      actor_id uuid, action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE OR REPLACE FUNCTION public.profile_completion_eligible(p_user_id uuid)
      RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;`);
  const credit = await fs.readFile('supabase/migrations/20261002143855_harden_internal_wallet_rpc_access.sql', 'utf8');
  await sql(credit.slice(0, credit.indexOf('CREATE OR REPLACE FUNCTION public.credit_pending_earnings')));
  await sql(await fs.readFile('supabase/migrations/20261023000636_atomic_affiliate_commission_clearing.sql', 'utf8'));
  await sql(await fs.readFile('supabase/migrations/20261029060000_affiliate_order_release_guard.sql', 'utf8'));
  await sql(`SELECT set_config('request.jwt.claim.role','service_role',false)`);

  async function seed({ kyc = 'approved', status = 'paid', legacy = false } = {}) {
    const owner = crypto.randomUUID(); const order = crypto.randomUUID();
    const link = crypto.randomUUID(); const click = crypto.randomUUID(); const attribution = crypto.randomUUID();
    await sql(`INSERT INTO public.users(id,email,full_name,email_verified_at,phone_verified_at,profile_completed_at,kyc_status,tier,status)
      VALUES($1,$2,'Synthetic affiliate',now(),now(),now(),$3,'kyc_verified','active')`, [owner, `${owner}@example.test`, kyc]);
    await sql(`INSERT INTO public.wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING`, [owner]);
    await sql(`INSERT INTO public.orders(id,user_id,status,subtotal,total_amount) VALUES($1,$2,$3,100,100)`, [order, owner, status]);
    await sql(`INSERT INTO public.affiliate_links(id,user_id,affiliate_code) VALUES($1,$2,$3)`, [link, owner, link]);
    await sql(`INSERT INTO public.affiliate_clicks(id,link_id) VALUES($1,$2)`, [click, link]);
    await sql(`INSERT INTO public.affiliate_attributions(id,click_id,order_id,commission_rate,commission_amount,created_at,hold_until)
      VALUES($1,$2,$3,0.03,3,now()-interval '10 days',CASE WHEN $4 THEN now()-interval '1 day' ELSE NULL END)`, [attribution, click, order, legacy]);
    return { owner, order, attribution };
  }
  const clear = (client, id, cutoff = null) => query(client,
    'SELECT public.clear_affiliate_commission($1,$2) AS result', [id, cutoff]).then((result) => result.rows[0].result);
  async function state(item) {
    return (await sql(`SELECT a.status,w.earnings_sen::int AS balance,
      (SELECT count(*)::int FROM public.wallet_transactions t WHERE t.user_id=$2 AND t.type='earnings') AS credits
      FROM public.affiliate_attributions a JOIN public.wallets w ON w.user_id=$2 WHERE a.id=$1`, [item.attribution, item.owner])).rows[0];
  }

  const failure = await seed();
  await sql(`CREATE FUNCTION pg_temp.fail_affiliate_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic_ledger_failure'; END $$;
    CREATE TRIGGER affiliate_test_failure BEFORE INSERT ON public.wallet_transactions
    FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_affiliate_ledger();`);
  try { await assert.rejects(() => clear(db, failure.attribution), /synthetic_ledger_failure/); }
  finally { await sql('DROP TRIGGER affiliate_test_failure ON public.wallet_transactions'); }
  assert.deepEqual(await state(failure), { status: 'pending', balance: 0, credits: 0 });
  assert.equal((await clear(db, failure.attribution)).outcome, 'confirmed');
  assert.equal((await clear(db, failure.attribution)).outcome, 'skipped');
  assert.deepEqual(await state(failure), { status: 'confirmed', balance: 300, credits: 1 });
  console.log('PASS affiliate: failed ledger rolls back; retry and replay produce exactly one credit');

  for (const options of [{ kyc: 'pending' }, { legacy: true }]) {
    const item = await seed(options);
    assert.equal((await clear(db, item.attribution)).outcome, 'skipped');
    assert.deepEqual(await state(item), { status: 'pending', balance: 0, credits: 0 });
  }

  const legacyGuestReview = await seed({ legacy: true });
  await sql(`INSERT INTO public.roles(name) VALUES('customer') ON CONFLICT(name) DO NOTHING`);
  const customerRoleId = (await sql(`SELECT id FROM public.roles WHERE name='customer'`)).rows[0].id;
  await sql(`INSERT INTO public.user_roles(user_id,role_id) VALUES($1,$2)`, [legacyGuestReview.owner, customerRoleId]);
  await sql(`UPDATE public.wallets SET pending_earnings_sen=300 WHERE user_id=$1`, [legacyGuestReview.owner]);
  await sql(`INSERT INTO public.affiliate_guest_commission_reviews(attribution_id,status) VALUES($1,'pending')`, [legacyGuestReview.attribution]);
  assert.equal(Number((await sql(`SELECT app_private.confirm_pending_earnings() AS result`)).rows[0].result), 0,
    'legacy clearer must skip pending Guest review');
  assert.deepEqual(await state(legacyGuestReview), { status: 'pending', balance: 0, credits: 0 });
  assert.equal(Number((await sql(`SELECT pending_earnings_sen FROM public.wallets WHERE user_id=$1`, [legacyGuestReview.owner])).rows[0].pending_earnings_sen), 300);
  const immature = await seed();
  assert.equal((await clear(db, immature.attribution, '2000-01-01T00:00:00Z')).outcome, 'skipped');

  const pickupReview = await seed();
  const eventContext = (await sql(`SELECT (SELECT id FROM public.vendors LIMIT 1) AS vendor_id,
    (SELECT id FROM public.outlets LIMIT 1) AS outlet_id,
    (SELECT id FROM public.promotion_campaign_locations LIMIT 1) AS location_id`)).rows[0];
  assert.ok(eventContext.vendor_id && eventContext.outlet_id && eventContext.location_id, 'event fixture must provide valid vendor/outlet/location references');
  await sql(`INSERT INTO public.order_items(order_id,vendor_id,outlet_id,product_name,unit_price,quantity,line_total,event_location_id,fulfil_status,pickup_date)
    VALUES($1,$2,$3,'Synthetic event ticket',10,1,10,$4,'pending',current_date-1)`,
    [pickupReview.order, eventContext.vendor_id, eventContext.outlet_id, eventContext.location_id]);
  const [exceptionId] = (await sql(`INSERT INTO public.event_order_exceptions(source_key,kind,order_id,verified_amount_sen,verified_currency,reason_code,state)
    VALUES('affiliate-test:'||$1::text,'pickup_overdue',$1::uuid,1000,'MYR','pickup_outcome_unconfirmed','open') RETURNING id`, [pickupReview.order])).rows.map((row) => row.id);
  assert.deepEqual(await clear(db, pickupReview.attribution), { outcome: 'order_review_required', reason: 'order_exception_open' });
  assert.deepEqual(await state(pickupReview), { status: 'pending', balance: 0, credits: 0 });
  const preview = await sql(`SELECT public.get_affiliate_order_release_preview($1::uuid[]) AS result`, [[pickupReview.attribution]]);
  assert.deepEqual(preview.rows[0].result, [{ id: pickupReview.attribution, reason: 'order_exception_open' }]);
  assert.deepEqual(await state(pickupReview), { status: 'pending', balance: 0, credits: 0 }, 'dry-run must not mutate wallet or attribution');

  await sql(`UPDATE public.event_order_exceptions SET state='resolved',resolution_code='customer_no_show' WHERE id=$1`, [exceptionId]);
  assert.deepEqual(await clear(db, pickupReview.attribution), { outcome: 'order_review_required', reason: 'no_show_policy' });
  await sql(`UPDATE public.event_order_exceptions SET resolution_code='collected' WHERE id=$1`, [exceptionId]);
  await sql(`UPDATE public.order_items SET fulfil_status='fulfilled',fulfilled_at=now() WHERE order_id=$1`, [pickupReview.order]);
  assert.equal((await clear(db, pickupReview.attribution)).outcome, 'confirmed');
  console.log('PASS affiliate: open pickup and unapproved no-show block credits; collected evidence permits one credit; preview is read-only');
  const cancelled = await seed({ status: 'cancelled' });
  assert.equal((await clear(db, cancelled.attribution)).outcome, 'reversed');
  assert.deepEqual(await state(cancelled), { status: 'reversed', balance: 0, credits: 0 });

  for (const role of ['anon', 'authenticated']) {
    await sql(`SET ROLE ${role}`);
    try { await assert.rejects(() => clear(db, immature.attribution), { code: '42501' }); }
    finally { await sql('RESET ROLE'); }
  }
  await sql(`SELECT set_config('request.jwt.claim.role','authenticated',false)`);
  try { await assert.rejects(() => clear(db, immature.attribution), { code: '42501' }); }
  finally { await sql(`SELECT set_config('request.jwt.claim.role','service_role',false)`); }
  console.log('PASS affiliate: eligibility/maturity/legacy boundaries and browser/runtime ACL');

  const competing = await seed();
  const config = db.connectionParameters;
  const clients = [new pg.Client({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.database }),
    new pg.Client({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.database })];
  const [a, b] = clients;
  let second;
  try {
    await Promise.all(clients.map((client) => client.connect()));
    await Promise.all(clients.map((client) => client.query("SELECT set_config('request.jwt.claim.role','service_role',false)")));
    await a.query('BEGIN');
    assert.equal((await clear(a, competing.attribution)).outcome, 'confirmed');
    second = clear(b, competing.attribution);
    let blocked = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      blocked = (await sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock') AS blocked`, [b.processID])).rows[0].blocked;
      if (blocked) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(blocked, 'second transaction must actually compete on a held row');
    await a.query('COMMIT');
    assert.equal((await second).outcome, 'skipped');
    assert.deepEqual(await state(competing), { status: 'confirmed', balance: 300, credits: 1 });
    console.log('PASS affiliate: two competing database transactions credit only once');

    const orderRace = await seed();
    await sql(`INSERT INTO public.order_items(order_id,vendor_id,outlet_id,product_name,unit_price,quantity,line_total,event_location_id,fulfil_status,pickup_date)
      VALUES($1,$2,$3,'Synthetic event ticket',10,1,10,$4,'pending',current_date-1)`,
      [orderRace.order, eventContext.vendor_id, eventContext.outlet_id, eventContext.location_id]);
    await a.query('BEGIN');
    await a.query('SELECT id FROM public.orders WHERE id=$1 FOR UPDATE', [orderRace.order]);
    const clearAfterException = clear(b, orderRace.attribution);
    let orderBlocked = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      orderBlocked = (await sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock') AS blocked`, [b.processID])).rows[0].blocked;
      if (orderBlocked) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(orderBlocked, 'clearing must wait for the order decision transaction');
    await a.query(`INSERT INTO public.event_order_exceptions(source_key,kind,order_id,verified_amount_sen,verified_currency,reason_code,state)
      VALUES('affiliate-race:'||$1::text,'pickup_overdue',$1::uuid,1000,'MYR','pickup_outcome_unconfirmed','open')`, [orderRace.order]);
    await a.query('COMMIT');
    assert.deepEqual(await clearAfterException, { outcome: 'order_review_required', reason: 'order_exception_open' });
    assert.deepEqual(await state(orderRace), { status: 'pending', balance: 0, credits: 0 });
    console.log('PASS affiliate: order-first lock prevents a concurrent pickup exception from racing with credit');
  } finally {
    await a.query('ROLLBACK').catch(() => undefined);
    await second?.catch(() => undefined);
    await Promise.all(clients.map((client) => client.end()));
  }
}
