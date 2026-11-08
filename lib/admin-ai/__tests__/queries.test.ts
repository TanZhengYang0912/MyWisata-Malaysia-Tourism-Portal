import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { KYC_STATUSES, USER_ROLES, WITHDRAWAL_STATUSES, findQuery } from '../queries';

/** Status list inside the CHECK (status IN (...)) that follows a constraint name. */
function constraintStatuses(file: string, constraint: string): string[] {
  const sql = readFileSync(resolve(process.cwd(), file), 'utf8');
  const after = sql.slice(sql.lastIndexOf(`ADD CONSTRAINT ${constraint}`));
  const list = after.slice(after.indexOf('IN (') + 4, after.indexOf(')'));
  return [...list.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

describe('admin AI data queries know every real status', () => {
  it('match the database status rules for KYC and withdrawals', () => {
    expect([...KYC_STATUSES]).toEqual(constraintStatuses('supabase/migrations/20261102095748_kyc_private_draft_operations.sql', 'kyc_submissions_status_check'));
    expect([...WITHDRAWAL_STATUSES]).toEqual(constraintStatuses('supabase/legacy-migrations/073_wallet_withdrawal_governance.sql', 'withdrawal_requests_status_check'));
  });

  it('accept the statuses staff actually ask about', () => {
    const withdrawals = findQuery('withdrawals_by_status')!;
    for (const status of ['pending_second_approval', 'hold', 'overdue', 'paid', 'failed']) {
      expect(withdrawals.paramsSchema.safeParse({ status }).success, status).toBe(true);
      expect(withdrawals.description).toContain(`"${status}"`);
    }
    expect(findQuery('kyc_pending_count')!.paramsSchema.safeParse({ status: 'info_requested' }).success).toBe(true);
    expect(findQuery('users_total')!.paramsSchema.safeParse({ role: 'event_vendor' }).success).toBe(true);
    expect([...USER_ROLES]).toEqual(expect.arrayContaining(['staff', 'event_vendor']));
  });

  it('reports every KYC status in the grouped count, including ones with no rows yet', async () => {
    const rows = [{ status: 'pending' }, { status: 'info_requested' }, { status: 'superseded' }];
    const service = { from: () => ({ select: async () => ({ data: rows, error: null }) }) } as unknown as SupabaseClient;
    const result = await findQuery('kyc_counts_by_status')!.run(service, {});
    expect(result).toEqual({ draft: 0, pending: 1, info_requested: 1, approved: 0, rejected: 0, superseded: 1, withdrawn: 0 });
  });
});
