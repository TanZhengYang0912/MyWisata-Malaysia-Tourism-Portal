/** Disposable PostgreSQL engine replay; never loads env or contacts the linked DB. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const root = (process.env.PATH ?? '').split(path.delimiter).map(dir => path.resolve(dir, '../@electric-sql/pglite/dist/index.js')).find(file => fs.existsSync(file));
if (!root) throw new Error('Run with npm exec --package=@electric-sql/pglite -- node scripts/test-owned-flow-recovery-db.mjs');
const { PGlite } = await import(pathToFileURL(root).href);
const db = new PGlite();
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uid(1),other=uid(2),global=uid(3),scoped=uid(4),inactive=uid(5),approver=uid(6);
const migration = name => fs.readFileSync(`supabase/migrations/${name}.sql`,'utf8');
const scalar = async (sql, params=[]) => Object.values((await db.query(sql,params)).rows[0])[0];
const role = async (name, sub=owner) => {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:name,sub})]);
  await db.exec(`SET ROLE ${name}`);
};
try {
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);
CREATE SCHEMA auth; CREATE SCHEMA app_private;
GRANT USAGE ON SCHEMA public,auth,app_private TO anon,authenticated,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claims',true)::jsonb->>'role'$$;
CREATE FUNCTION app_private.require_kyc_job_service() RETURNS void LANGUAGE plpgsql AS $$BEGIN IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'service_required'; END IF; END$$;
CREATE TABLE users(id uuid PRIMARY KEY,email text,full_name text,preferred_locale text,status text);
CREATE TABLE roles(id uuid PRIMARY KEY,name text);
CREATE TABLE user_roles(user_id uuid,role_id uuid,vendor_id uuid,outlet_id uuid);
CREATE TABLE withdrawal_requests(id uuid PRIMARY KEY,user_id uuid,status text,approval_cycle integer);
CREATE TABLE app_private.withdrawal_approver_jobs(withdrawal_id uuid,cycle integer,stage text CHECK(stage IN ('pending','pending_second_approval')),cursor_id uuid,completed boolean DEFAULT false,attempts integer DEFAULT 0,token uuid,lease_until timestamptz,available_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),PRIMARY KEY(withdrawal_id,cycle,stage));
CREATE TABLE notifications(id uuid DEFAULT gen_random_uuid(),user_id uuid,type text,title text,body text,link text,category text,event_key text UNIQUE,metadata jsonb);
CREATE FUNCTION public.has_staff_permission(uuid,text) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE TABLE audit_logs(id uuid DEFAULT gen_random_uuid(),actor_id uuid,action text,entity_type text,entity_id uuid,before_data jsonb,after_data jsonb,note text);
CREATE TABLE orders(id uuid PRIMARY KEY,display_id text,user_id uuid,status text,subtotal numeric,discount_amount numeric,total_amount numeric,payment_method text,created_at timestamptz);
CREATE TABLE outlets(id uuid PRIMARY KEY,name text);
CREATE TABLE categories(id uuid PRIMARY KEY,slug text);
CREATE TABLE products(id uuid PRIMARY KEY,cover_url text,category_id uuid);
CREATE TABLE order_items(id uuid PRIMARY KEY,order_id uuid,product_id uuid,product_name text,image_url text,variant_name text,slot_starts_at timestamptz,nights integer,unit_price numeric,quantity integer,outlet_id uuid);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY owned ON orders FOR SELECT TO authenticated USING(user_id=auth.uid());
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY owned ON order_items FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM orders WHERE orders.id=order_id));
GRANT SELECT ON orders,order_items,outlets,products,categories TO authenticated;
`);
// Record predates overdue support: the forward migration must enqueue it.
await db.query('INSERT INTO withdrawal_requests VALUES($1,$2,$3,1)',[uid(100),owner,'overdue']);
await db.exec(migration('20261030122005_withdrawal_escalation_recovery'));
await db.exec(migration('20261030123521_owned_flow_recovery_and_order_pages'));
const historyMigration=fs.readdirSync('supabase/migrations').find(name=>name.endsWith('_withdrawal_escalation_history_alignment.sql'));
await db.exec(fs.readFileSync(path.join('supabase/migrations',historyMigration),'utf8'));
assert.equal(await scalar("SELECT count(*)::int FROM supabase_migrations.schema_migrations WHERE version='20261028045801'"),1);
assert.equal(await scalar("SELECT count(*)::int FROM app_private.withdrawal_approver_jobs WHERE stage='overdue'"),1);
await db.exec(migration('20261030122005_withdrawal_escalation_recovery'));
assert.equal(await scalar("SELECT count(*)::int FROM app_private.withdrawal_approver_jobs"),1);
await db.query("INSERT INTO roles VALUES($1,'super_admin'),($2,'approver')",[uid(20),uid(21)]);
for (const [id,status] of [[owner,'active'],[global,'active'],[scoped,'active'],[inactive,'suspended'],[approver,'active']]) {
 await db.query('INSERT INTO users VALUES($1,$2,$3,$4,$5)',[id,'synthetic@example.invalid','Synthetic','en',status]);
 await db.query('INSERT INTO user_roles VALUES($1,$2,$3,NULL)',[id,id===approver?uid(21):uid(20),id===scoped?uid(99):null]);
}
await db.query("UPDATE app_private.withdrawal_approver_jobs SET token=$1,lease_until=now()+interval '5 minutes'",[uid(50)]);
await role('service_role');
await db.exec('RESET ROLE');
await db.exec("UPDATE app_private.withdrawal_approver_jobs SET lease_until=now()-interval '1 second'");
await role('service_role');
assert.equal((await scalar('SELECT app_private.deliver_withdrawal_approver_notifications($1,1,$2,$3,NULL)',[uid(100),'overdue',uid(50)])).stale,true);
await db.exec('RESET ROLE');
await db.exec("UPDATE app_private.withdrawal_approver_jobs SET lease_until=now()+interval '5 minutes'");
await db.exec('UPDATE withdrawal_requests SET approval_cycle=2');
await role('service_role');
assert.equal((await scalar('SELECT app_private.deliver_withdrawal_approver_notifications($1,1,$2,$3,NULL)',[uid(100),'overdue',uid(50)])).stale,true);
await db.exec('RESET ROLE');
await db.exec('UPDATE withdrawal_requests SET approval_cycle=1');
await db.query("UPDATE app_private.withdrawal_approver_jobs SET completed=false,token=$1,lease_until=now()+interval '5 minutes'",[uid(50)]);
await role('service_role');
const batch=await scalar('SELECT app_private.deliver_withdrawal_approver_notifications($1,1,$2,$3,NULL)',[uid(100),'overdue',uid(50)]);
assert.deepEqual(batch.recipients.map(x=>x.id),[global]);
await scalar('SELECT app_private.deliver_withdrawal_approver_notifications($1,1,$2,$3,NULL)',[uid(100),'overdue',uid(50)]);
await db.exec('RESET ROLE');
assert.equal(await scalar('SELECT count(*)::int FROM notifications'),1);
await db.exec("UPDATE app_private.withdrawal_approver_jobs SET attempts=10,token=NULL,lease_until=NULL");
for(const name of ['anon','authenticated']) {
 await role(name);await assert.rejects(()=>scalar('SELECT public.requeue_withdrawal_approver_job($1,1,$2,$3)',[uid(100),'overdue','Synthetic operational retry']),/permission denied/);
}
await role('service_role');
assert.equal(await scalar('SELECT public.requeue_withdrawal_approver_job($1,1,$2,$3)',[uid(100),'overdue','Synthetic operational retry']),true);
assert.equal(await scalar('SELECT public.requeue_withdrawal_approver_job($1,1,$2,$3)',[uid(100),'overdue','Synthetic operational retry']),false);
await db.exec('RESET ROLE');assert.equal(await scalar('SELECT count(*)::int FROM audit_logs'),1);
const syntheticAudit=(await db.query('SELECT action,entity_type,before_data,after_data,note FROM audit_logs')).rows;
await db.query('INSERT INTO outlets VALUES($1,$2)',[uid(200),'Synthetic shop']);
for(let n=1;n<=23;n++) {
 const id=uid(300+n);
 await db.query('INSERT INTO orders VALUES($1,$2,$3,$4,10,0,10,$5,$6)',[id,`ORD-${n}`,owner,n%2?'paid':'completed','test','2026-10-02T00:00:00Z']);
 await db.query('INSERT INTO order_items VALUES($1,$2,NULL,$3,NULL,$4,$5,1,10,1,$6)',[uid(500+n),id,n===1?'Unique soy sauce':'Product','Standard',n%3===0?'2026-10-03T00:00:00Z':null,uid(200)]);
}
await db.query('INSERT INTO orders VALUES($1,$2,$3,$4,99,0,99,$5,now())',[uid(399),'ORD-PRIVATE',other,'paid','test']);
// Mixed order must be classified using all lines before paging.
await db.query('INSERT INTO order_items VALUES($1,$2,NULL,$3,NULL,$4,$5,1,10,1,$6)',[uid(599),uid(303),'Booking','Booking','2026-10-03T00:00:00Z',uid(200)]);
await db.query('INSERT INTO order_items VALUES($1,$2,NULL,$3,NULL,$4,NULL,1,10,1,$5)',[uid(598),uid(303),'Product','Standard',uid(200)]);
await role('authenticated');
const page=async(n,q='',kind='all')=>scalar('SELECT public.list_my_orders($1,$2,$3,$4)',[n,q,'all',kind]);
const a=await page(1),b=await page(2),c=await page(3),end=await page(99);
assert.equal(a.total,23);assert.equal(a.orders.length,10);assert.equal(c.orders.length,3);assert.equal(end.page,3);
assert.equal(new Set([...a.orders,...b.orders,...c.orders].map(x=>x.id)).size,23);
assert.equal((await page(1,'ORD-PRIVATE')).total,0);
assert.equal((await page(1,'Unique soy sauce')).total,1);
assert.equal((await page(1,'','mixed')).total,1);
assert.equal((await page(1)).stats.total,23);
assert.equal(a.orders[0].id,uid(323));assert.equal(b.orders[0].id,uid(313));
assert.equal((await page(1,'Synthetic shop')).total,23);
assert.equal((await page(1,'Booking')).total,1);
assert.equal((await scalar("SELECT public.list_my_orders(1,'','paid')")).total,12);
assert.equal((await scalar("SELECT public.list_my_orders(1,'','all','all',$1)",[uid(999)])).total,0);
assert.ok(!JSON.stringify(a).includes('contact_email'));
await db.exec('RESET ROLE');
for(const [n,date] of [[700,'2026-09-30T16:00:00Z'],[701,'2026-10-01T16:00:00Z']]) await db.query('INSERT INTO orders VALUES($1,$2,$3,$4,10,0,10,$5,$6)',[uid(n),`ORD-${n}`,owner,'paid','test',date]);
await role('authenticated');
const dated=await scalar(`SELECT public.list_my_orders(1,'','all','all',NULL,$1,$2)`,['2026-09-30T16:00:00Z','2026-10-01T15:59:59.999Z']);
assert.equal(dated.total,1);
await role('authenticated',other);assert.equal((await page(1)).total,1);
await role('anon');await assert.rejects(()=>page(1),/permission denied/);
if(process.env.OWNED_FLOW_EVIDENCE_DIR) {fs.mkdirSync(process.env.OWNED_FLOW_EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.OWNED_FLOW_EVIDENCE_DIR,'sql-recovery-evidence.json'),JSON.stringify({scope:'isolated PostgreSQL engine; synthetic rows only',syntheticAudit,ownerIsolation:true,globalRecipients:true,idempotentBackfill:true,remoteWrites:0},null,2));}
console.log(JSON.stringify({sqlReplay:'passed',ownerIsolation:true,globalRecipients:true,idempotentBackfill:true,requeueAudit:true,pagination:true,remoteWrites:0}));
} finally { await db.close(); }
