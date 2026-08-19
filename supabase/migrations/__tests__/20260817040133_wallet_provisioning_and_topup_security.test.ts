import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260817040133_wallet_provisioning_and_topup_security.sql',
);

function migrationSql() {
  expect(existsSync(migrationPath), 'wallet provisioning migration must exist').toBe(true);
  return existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
}

describe('wallet provisioning and top-up security migration', () => {
  it('backfills only missing zero-balance wallets and provisions future public users', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/INSERT\s+INTO\s+public\.wallets\s*\(user_id\)[\s\S]*SELECT\s+u\.id\s+FROM\s+public\.users\s+AS\s+u[\s\S]*ON\s+CONFLICT\s*\(user_id\)\s+DO\s+NOTHING/i);
    expect(sql).toMatch(/CREATE\s+TRIGGER\s+[^\s]+[\s\S]*AFTER\s+INSERT\s+ON\s+public\.users[\s\S]*EXECUTE\s+FUNCTION\s+public\.[^(]+\(\)/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.wallets\s+SET\s+(topup_sen|earnings_sen)\s*=\s*0/i);
  });

  it('validates top-up inputs and makes concurrent event replay credit once', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/p_amount_sen\s+IS\s+NULL\s+OR\s+p_amount_sen\s*<=\s*0/i);
    expect(sql).toMatch(/p_stripe_event_id\s+IS\s+NULL[\s\S]*btrim\(p_stripe_event_id\)\s*=\s*''/i);
    expect(sql).toMatch(/ON\s+CONFLICT\s*\(stripe_event_id\)\s+DO\s+NOTHING\s+RETURNING\s+id\s+INTO/i);
    expect(sql).toMatch(/stripe_event_id_payload_mismatch/i);
    expect(sql).toMatch(/IF\s+v_transaction_id\s+IS\s+NULL\s+THEN[\s\S]*RETURN;[\s\S]*END\s+IF;[\s\S]*UPDATE\s+public\.wallets/i);
  });

  it('allows only the service role to execute the hardened RPC', () => {
    const sql = migrationSql();

    expect(sql).toMatch(/SECURITY\s+DEFINER[\s\S]*SET\s+search_path\s*=\s*public,\s*pg_temp/i);
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.credit_topup\(UUID,\s*BIGINT,\s*TEXT,\s*TEXT\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.credit_topup\(UUID,\s*BIGINT,\s*TEXT,\s*TEXT\)\s+TO\s+service_role/i);
  });
});
