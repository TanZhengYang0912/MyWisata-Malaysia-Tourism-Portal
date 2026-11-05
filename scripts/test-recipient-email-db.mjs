#!/usr/bin/env node
/** Isolated loopback verification. No production data, SMTP or financial operations. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
const host = process.env.EMAIL_TEST_PGHOST ?? '127.0.0.1';
if (!['127.0.0.1','::1','localhost'].includes(host) || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL) throw new Error('loopback_database_required');
const config = { host, port: 55439, user: 'postgres', password: 'email-test-only', database: 'postgres' };
const name = `recipient_locale_${Date.now()}_${process.pid}`;
const admin = new pg.Client(config); const db = new pg.Client({ ...config, database: name });
const zh = '11111111-1111-4111-8111-111111111111';
const ms = '22222222-2222-4222-8222-222222222222';
await admin.connect();
try {
  await admin.query(`create database ${name}`); await db.connect();
  await db.query(`create schema auth; create schema app_private;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.users(id uuid primary key,email text,preferred_locale text);
    create table public.orders(id uuid primary key default gen_random_uuid(),user_id uuid,guest_subject_id uuid,contact_email text,contact_locale text default 'en',status text default 'paid');
    create table public.email_outbox(id uuid primary key default gen_random_uuid(),user_id uuid,to_email text,event_key text,event_type text default 'checkout_succeeded',payload jsonb,status text default 'pending');
    create function app_private.checkout_transaction_core(p_contact jsonb) returns jsonb language plpgsql as $$ declare v_id uuid; begin
      insert into public.orders(guest_subject_id,contact_email) values(gen_random_uuid(),p_contact->>'email') returning id into v_id;
      return jsonb_build_object('order_id',v_id); end $$;
    create function public.guest_prepare_checkout(p_contact jsonb) returns jsonb language plpgsql as $$ BEGIN RETURN app_private.checkout_transaction_core(p_contact); END; $$;
    create function public.guest_prepare_event_checkout(p_contact jsonb) returns jsonb language plpgsql as $$ BEGIN RETURN app_private.checkout_transaction_core(p_contact); END; $$;
    insert into auth.users(id,raw_user_meta_data) values('${ms}','{"preferred_locale":"en","unchanged":"keep"}');
    insert into public.users values('${ms}','ms@example.test','ms');`);
  await db.query(readFileSync('supabase/migrations/20261014143818_recipient_email_locale.sql','utf8'));
  await db.query(readFileSync('supabase/migrations/20261029223809_receipt_contact_locale_precedence.sql','utf8'));
  await db.query(`insert into auth.users(id,raw_user_meta_data) values($1,'{"preferred_locale":"zh-CN","unchanged":"keep"}')`,[zh]);
  await db.query("insert into public.users values($1,'zh@example.test',null)",[zh]);
  assert.equal((await db.query('select preferred_locale from public.users where id=$1',[zh])).rows[0].preferred_locale,'zh-CN');
  assert.equal((await db.query('select raw_user_meta_data from auth.users where id=$1',[ms])).rows[0].raw_user_meta_data.preferred_locale,'ms');
  await db.query("update public.users set preferred_locale='ms' where id=$1",[zh]);
  assert.deepEqual((await db.query('select raw_user_meta_data from auth.users where id=$1',[zh])).rows[0].raw_user_meta_data,{preferred_locale:'ms',unchanged:'keep'});
  console.log('PASS signup initialization, existing preference reconciliation and atomic Auth projection preserve unrelated metadata');
  await db.query("update public.users set preferred_locale='zh-CN' where id=$1",[zh]);
  const mail = await db.query("insert into public.email_outbox(user_id,to_email,event_key,payload) values($1,'zh@example.test','test','{\"locale\":\"en\"}') returning id,payload",[zh]);
  assert.equal(mail.rows[0].payload.locale,'zh-CN');
  await db.query("update public.users set preferred_locale='ms' where id=$1",[zh]);
  await db.query("update public.email_outbox set status='sending' where id=$1",[mail.rows[0].id]);
  assert.equal((await db.query('select payload from public.email_outbox where id=$1',[mail.rows[0].id])).rows[0].payload.locale,'zh-CN');
  const mixed = await db.query("insert into public.email_outbox(user_id,to_email,event_key,payload) values($1,'ms@example.test','other-admin','{}') returning payload",[ms]);
  assert.equal(mixed.rows[0].payload.locale,'ms');
  console.log('PASS per-recipient fanout and immutable retry locale');
  const paidOrder = '33333333-3333-4333-8333-333333333333';
  const unpaidOrder = '44444444-4444-4444-8444-444444444444';
  await db.query("insert into public.orders(id,user_id,contact_email,contact_locale,status) values($1,$2,'alternate@example.test','zh-CN','paid'),($3,$2,'unpaid@example.test','ms','pending_payment')", [paidOrder, zh, unpaidOrder]);
  const alternate = await db.query("insert into public.email_outbox(user_id,to_email,event_key,event_type,payload) values($1,'alternate@example.test','alternate','checkout_succeeded',jsonb_build_object('locale','en','receiptOrderId',$2)) returning payload", [zh, paidOrder]);
  assert.equal(alternate.rows[0].payload.locale,'zh-CN');
  const unpaid = await db.query("insert into public.email_outbox(user_id,to_email,event_key,event_type,payload) values($1,'unpaid@example.test','unpaid','checkout_succeeded',jsonb_build_object('locale','ms','receiptOrderId',$2)) returning payload", [zh, unpaidOrder]);
  assert.equal(unpaid.rows[0].payload.locale,'en');
  const forged = await db.query("insert into public.email_outbox(user_id,to_email,event_key,event_type,payload) values($1,'attacker@example.test','forged','checkout_succeeded',jsonb_build_object('locale','zh-CN','receiptOrderId',$2)) returning payload", [zh, paidOrder]);
  assert.equal(forged.rows[0].payload.locale,'en');
  console.log('PASS alternate registered receipt locale requires a matching paid order, owner and recipient');
  for (const route of ['guest_prepare_checkout','guest_prepare_event_checkout']) {
    const order = (await db.query(`select public.${route}('{"email":"guest@example.test","locale":"zh-CN"}') as result`)).rows[0].result.order_id;
    assert.equal((await db.query('select contact_locale from public.orders where id=$1',[order])).rows[0].contact_locale,'zh-CN');
    const guestMail = await db.query("insert into public.email_outbox(to_email,event_key,payload) values('guest@example.test',$1,jsonb_build_object('reference',$1::text)) returning payload",[order]);
    assert.equal(guestMail.rows[0].payload.locale,'zh-CN');
  }
  const fallback = await db.query("insert into public.email_outbox(to_email,event_key,payload) values('new@example.test','new','{\"locale\":\"invalid\"}') returning payload");
  assert.equal(fallback.rows[0].payload.locale,'en');
  console.log('PASS both Guest checkout paths retain language for asynchronous mail and invalid preferences fall back to English');
  const message = 'The pickup date has passed and collection is unconfirmed. Please verify whether your items were handed over and contact Admin with the actual outcome.';
  const exception = await db.query("insert into public.email_outbox(to_email,event_key,payload) values('new@example.test','vendor_exception:case:pickup_review:recipient',jsonb_build_object('reason',$1::text)) returning payload",[message+' MW-TEST · 2 × Cake']);
  assert.equal(exception.rows[0].payload.reasonCode,'pickup_review');
  assert.equal(exception.rows[0].payload.reasonDetails,'MW-TEST · 2 × Cake');
  assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname like '%email_locale%' and has_function_privilege('authenticated',p.oid,'EXECUTE')")).rows[0].n,0);
  console.log('PASS structured exception messages and private trigger ACLs');
  assert.equal((await db.query("select has_function_privilege('anon','public.set_my_preferred_locale(text)','EXECUTE') allowed")).rows[0].allowed,false);
  await db.query('set role authenticated');
  await assert.rejects(db.query("select public.set_my_preferred_locale('ms')"),{code:'42501'});
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[zh]);
  await assert.rejects(db.query("select public.set_my_preferred_locale('arbitrary')"),{code:'22023'});
  await db.query("select public.set_my_preferred_locale('zh-CN')");
  await db.query('reset role');
  assert.equal((await db.query('select preferred_locale from public.users where id=$1',[ms])).rows[0].preferred_locale,'ms');
  console.log('PASS own-account-only language RPC, anonymous denial and invalid locale rejection');
  // Same lock direction as the installed Auth email-verification trigger.
  await db.query(`create function auth.sync_test_verification() returns trigger language plpgsql as $$ BEGIN UPDATE public.users SET email=NEW.email WHERE id=NEW.id; RETURN NEW; END $$;
    create trigger sync_test_verification after update of email on auth.users for each row execute function auth.sync_test_verification();`);
  const other=new pg.Client({...config,database:name});await other.connect();
  try {
    await other.query('begin');await other.query('select 1 from auth.users where id=$1 for update',[zh]);
    await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[zh]);
    const change=process.env.LEGACY_LOCALE_LOCK_RED==='1'
      ? db.query("update public.users set preferred_locale='zh-CN' where id=$1",[zh])
      : db.query("select public.set_my_preferred_locale('zh-CN')");
    const outcome=change.then(()=>null,error=>error.code);

    // Let the first request enter its lock wait before confirming the email.
    for(let i=0;i<30;i++) {
      const wait=await admin.query("select 1 from pg_stat_activity where datname=$1 and wait_event_type='Lock'",[name]);
      if(wait.rows.length)break;await new Promise(resolve=>setTimeout(resolve,10));
    }
    const verification=await other.query("update auth.users set email='verified@example.test' where id=$1",[zh]).then(()=>null,error=>error.code);
    await other.query(verification?'rollback':'commit');
    const changed=await outcome;await db.query(changed?'rollback':'commit');
    assert.equal(changed,null);assert.equal(verification,null);
    console.log('PASS language save and email verification share a consistent Auth-first lock order');
  } finally {await other.end();}

} finally {
  await db.end().catch(()=>{});
  await admin.query(`drop database if exists ${name} with (force)`).catch(()=>{});
  await admin.end();
}
