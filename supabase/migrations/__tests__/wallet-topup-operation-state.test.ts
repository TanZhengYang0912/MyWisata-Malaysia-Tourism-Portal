import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261104155949_wallet_topup_operations.sql', 'utf8');

describe('wallet top-up operation state transitions', () => {
  it('does not let a late session-create response reopen a terminal or paid operation', () => {
    const recorder = migration.match(/FUNCTION app_private\.record_wallet_topup_session[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(recorder).toContain("IF v_operation.state = 'credited' THEN");
    expect(recorder).toContain("checkout_url=NULL");
    expect(recorder).toContain("state='checking'");
    expect(recorder).toContain("ELSIF v_operation.state IN ('creating','checking','open','paid_pending_credit') THEN");
  });
});
