import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '073_wallet_withdrawal_governance.sql');

describe('wallet withdrawal governance migration contract', () => {
  it('adds the agreed balance projections, settings and active withdrawal states', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('reserved_earnings_sen');
    expect(sql).toContain('withdrawn_earnings_sen');
    expect(sql).toContain("'wallet.clearance_days'");
    expect(sql).toContain("'withdrawal.dual_approval_threshold_sen'");
    expect(sql).toContain("'pending_second_approval'");
    expect(sql).toContain("'hold'");
    expect(sql).toContain("'overdue'");
  });

  it('preserves append-only Wallet transactions and constrains new transaction types to their buckets', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain("'refund'");
    expect(sql).toContain("'adjustment_credit'");
    expect(sql).toContain("'adjustment_debit'");
    expect(sql).toContain('wt_bucket_type_consistent');
    expect(sql).toContain('reserved_earnings_sen >= 0');
  });

  it('settles Wallet checkout under a Wallet row lock before it commits the order', async () => {
    const sql = await readFile(migrationPath, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.finalize_checkout');
    expect(sql).toContain("IF v_session.payment_method = 'wallet' THEN");
    expect(sql).toContain('WHERE user_id = v_session.user_id');
    expect(sql).toContain("RAISE EXCEPTION 'wallet_insufficient'");
    expect(sql).toContain("'wallet-spend:' || v_session.id::text || ':topup'");
    expect(sql).toContain("'wallet-spend:' || v_session.id::text || ':earnings'");
  });
});
