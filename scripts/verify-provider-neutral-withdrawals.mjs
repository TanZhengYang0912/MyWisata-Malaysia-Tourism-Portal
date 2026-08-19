#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

for (const filename of ['.env.local', '.env']) {
  const filepath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filepath)) continue;
  for (const line of fs.readFileSync(filepath, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  break;
}

const connectionString = process.env.WITHDRAWAL_TEST_DATABASE_URL;
const confirmation = process.env.WITHDRAWAL_TEST_DB_CONFIRM;
const allow = process.env.WITHDRAWAL_TEST_ALLOW;
if (!connectionString || !confirmation) {
  throw new Error('WITHDRAWAL_TEST_DATABASE_URL and WITHDRAWAL_TEST_DB_CONFIRM are required. Generic or production database variables are refused.');
}
if (allow !== 'isolated-withdrawal-test') {
  throw new Error('Set WITHDRAWAL_TEST_ALLOW=isolated-withdrawal-test only for a disposable/local test database.');
}

const parsedUrl = new URL(connectionString);
const projectRef = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1'
  ? 'local'
  : parsedUrl.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1];
if (!projectRef || confirmation !== projectRef) {
  throw new Error('WITHDRAWAL_TEST_DB_CONFIRM must exactly match the Supabase project ref, or "local" for localhost.');
}

const client = new pg.Client({
  connectionString,
  ssl: projectRef === 'local' ? false : { rejectUnauthorized: false },
});

function assert(condition, label) {
  if (!condition) throw new Error(`Verification failed: ${label}`);
}

let savepointSequence = 0;
async function expectDenied(label, operation) {
  const savepoint = `withdrawal_verify_${++savepointSequence}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  let denied = false;
  try {
    await operation();
  } catch {
    denied = true;
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  }
  if (!denied) throw new Error(`Verification failed: ${label} was unexpectedly allowed`);
}

async function setActor(role, userId = '') {
  await client.query(`SET LOCAL ROLE ${role}`);
  await client.query("SELECT set_config('request.jwt.claim.role', $1, true), set_config('request.jwt.claim.sub', $2, true)", [role, userId]);
}

async function main() {
  const runId = crypto.randomUUID();
  const ids = {
    customer: crypto.randomUUID(),
    secondCustomer: crypto.randomUUID(),
    approver: crypto.randomUUID(),
    secondApprover: crypto.randomUUID(),
    destination: crypto.randomUUID(),
    secondDestination: crypto.randomUUID(),
    withdrawal: crypto.randomUUID(),
    dualWithdrawal: crypto.randomUUID(),
  };

  await client.connect();
  await client.query('BEGIN');
  try {
    const functions = await client.query(`
      SELECT proname FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace
         AND proname IN ('record_stripe_payout','record_withdrawal_execution_failure','record_withdrawal_payout_retry')
    `);
    assert(functions.rowCount === 3, 'migration 099 payout safety functions are installed');

    const roles = await client.query("SELECT id, name FROM public.roles WHERE name IN ('customer','approver')");
    const roleMap = Object.fromEntries(roles.rows.map((row) => [row.name, row.id]));
    assert(roleMap.customer && roleMap.approver, 'customer and approver roles exist');

    for (const [index, id] of [ids.customer, ids.secondCustomer, ids.approver, ids.secondApprover].entries()) {
      await client.query(
        `INSERT INTO public.users(id,email,full_name,kyc_status,email_verified_at,phone_verified_at,profile_completed_at,tier)
         VALUES ($1,$2,$3,'approved',now(),now(),now(),'kyc_verified')`,
        [id, `withdrawal-test-${runId}-${index}@example.invalid`, `Withdrawal Test ${index}`],
      );
    }
    await client.query(
      `INSERT INTO public.user_roles(user_id,role_id) VALUES ($1,$3),($2,$3),($4,$5),($6,$5)`,
      [ids.customer, ids.secondCustomer, roleMap.customer, ids.approver, roleMap.approver, ids.secondApprover],
    );

    const customerWallet = (await client.query(
      `INSERT INTO public.wallets(user_id,earnings_sen,reserved_earnings_sen)
       VALUES ($1,0,5000) RETURNING id`, [ids.customer],
    )).rows[0].id;
    const secondWallet = (await client.query(
      `INSERT INTO public.wallets(user_id,earnings_sen,reserved_earnings_sen)
       VALUES ($1,0,5000) RETURNING id`, [ids.secondCustomer],
    )).rows[0].id;

    await client.query(
      `INSERT INTO public.payout_destinations(
         id,user_id,dest_type,label,masked_ref,is_default,provider,provider_reference,verification_status,verified_at
       ) VALUES
         ($1,$2,'ewallet','TNG eWallet','••••6789',true,'tng_direct_credit',$3,'verified',now()),
         ($4,$5,'ewallet','TNG eWallet','••••5678',true,'tng_direct_credit',$6,'verified',now())`,
      [ids.destination, ids.customer, `tng_dest_${crypto.randomBytes(16).toString('hex')}`, ids.secondDestination, ids.secondCustomer, `tng_dest_${crypto.randomBytes(16).toString('hex')}`],
    );

    await setActor('authenticated', ids.customer);
    await expectDenied('destination self-verification denial', () => client.query(
      "UPDATE public.payout_destinations SET verification_status='verified' WHERE id=$1", [ids.destination],
    ));
    await client.query('RESET ROLE');

    await client.query(
      `INSERT INTO public.withdrawal_requests(
         id,user_id,wallet_id,destination_id,amount,status,requires_dual_approval,destination_label,
         destination_provider,destination_provider_reference,payout_provider,approval_cycle
       ) VALUES
         ($1,$2,$3,$4,50,'approved',false,'TNG eWallet ••••6789','tng_direct_credit',$5,'tng_direct_credit',1),
         ($6,$7,$8,$9,50,'approved',true,'TNG eWallet ••••5678','tng_direct_credit',$10,'tng_direct_credit',1)`,
      [
        ids.withdrawal, ids.customer, customerWallet, ids.destination, `tng_dest_${crypto.randomBytes(16).toString('hex')}`,
        ids.dualWithdrawal, ids.secondCustomer, secondWallet, ids.secondDestination, `tng_dest_${crypto.randomBytes(16).toString('hex')}`,
      ],
    );
    await client.query(
      `INSERT INTO public.withdrawal_risk_assessments(withdrawal_id,risk_level,snapshot)
       VALUES ($1,'low','{}'::jsonb),($2,'low','{}'::jsonb)`,
      [ids.withdrawal, ids.dualWithdrawal],
    );
    await client.query(
      `INSERT INTO public.withdrawal_approvals(request_id,approver_id,action,note,approval_cycle,reason_category)
       VALUES ($1,$2,'approve','Test approval evidence checked.',1,'review_completed'),
              ($3,$2,'approve','First dual approval checked.',1,'review_completed')`,
      [ids.withdrawal, ids.approver, ids.dualWithdrawal],
    );

    await setActor('service_role');
    const payoutId = `tng_payout_${crypto.randomBytes(16).toString('hex')}`;
    await client.query('SELECT public.start_withdrawal_payout_attempt($1)', [ids.withdrawal]);
    await client.query('SELECT public.record_tng_payout($1,$2)', [ids.withdrawal, payoutId]);
    await client.query('SELECT public.mark_provider_withdrawal_processing($1,$2,$3)', [ids.withdrawal, 'tng_direct_credit', payoutId]);
    const paid = await client.query("SELECT public.complete_withdrawal_payout($1,$2,'paid') AS result", [ids.withdrawal, payoutId]);
    assert(paid.rows[0].result.status === 'paid', 'provider-aware processing and settlement');
    const beforeReplay = await client.query('SELECT earnings_sen,reserved_earnings_sen,withdrawn_earnings_sen FROM public.wallets WHERE id=$1', [customerWallet]);
    const replay = await client.query("SELECT public.complete_withdrawal_payout($1,$2,'paid') AS result", [ids.withdrawal, payoutId]);
    const afterReplay = await client.query('SELECT earnings_sen,reserved_earnings_sen,withdrawn_earnings_sen FROM public.wallets WHERE id=$1', [customerWallet]);
    assert(replay.rows[0].result.idempotent === true && JSON.stringify(beforeReplay.rows[0]) === JSON.stringify(afterReplay.rows[0]), 'replay idempotency');

    const dualPayoutId = `tng_payout_${crypto.randomBytes(16).toString('hex')}`;
    await client.query('SELECT public.start_withdrawal_payout_attempt($1)', [ids.dualWithdrawal]);
    await client.query('SELECT public.record_tng_payout($1,$2)', [ids.dualWithdrawal, dualPayoutId]);
    await expectDenied('dual approval', () => client.query(
      'SELECT public.mark_provider_withdrawal_processing($1,$2,$3)',
      [ids.dualWithdrawal, 'tng_direct_credit', dualPayoutId],
    ));
    await client.query(
      `INSERT INTO public.withdrawal_approvals(request_id,approver_id,action,note,approval_cycle,reason_category)
       VALUES ($1,$2,'approve','Second dual approval checked.',1,'review_completed')`,
      [ids.dualWithdrawal, ids.secondApprover],
    );
    await client.query('SELECT public.mark_provider_withdrawal_processing($1,$2,$3)', [ids.dualWithdrawal, 'tng_direct_credit', dualPayoutId]);

    await setActor('authenticated', ids.approver);
    await expectDenied('append-only ledger update', () => client.query(
      "UPDATE public.wallet_transactions SET note='tampered' WHERE withdrawal_id=$1", [ids.withdrawal],
    ));
    await expectDenied('append-only audit delete', () => client.query(
      "DELETE FROM public.audit_logs WHERE entity_type='withdrawal' AND entity_id=$1", [ids.withdrawal],
    ));
    await client.query('RESET ROLE');

    await setActor('authenticated', ids.customer);
    await expectDenied('evidence authorization', () => client.query(
      'SELECT public.get_withdrawal_review_sources($1,100,0)', [ids.withdrawal],
    ));
    await client.query('RESET ROLE');
    await setActor('authenticated', ids.approver);
    await client.query('SELECT public.get_withdrawal_review_sources($1,100,0)', [ids.withdrawal]);
    await client.query('RESET ROLE');

    await setActor('service_role');
    const receipt = await client.query(
      'SELECT payout_provider,destination_label,payout_provider_event_id,status FROM public.withdrawal_requests WHERE id=$1',
      [ids.withdrawal],
    );
    assert(receipt.rows[0].payout_provider === 'tng_direct_credit' && receipt.rows[0].destination_label.includes('••••'), 'provider-neutral receipt data is masked');
    const report = await client.query("SELECT public.generate_monthly_payout_report(date_trunc('month', now())::date,'scheduler') AS result");
    assert(JSON.stringify(report.rows[0].result).includes('tng_direct_credit'), 'monthly report inclusion');

    console.log(JSON.stringify({
      verified: true,
      checks: [
        'destination self-verification denial',
        'provider-aware processing and settlement',
        'replay idempotency',
        'dual approval',
        'append-only ledger and audit',
        'evidence authorization',
        'masked receipt data',
        'monthly report inclusion',
      ],
    }, null, 2));
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
