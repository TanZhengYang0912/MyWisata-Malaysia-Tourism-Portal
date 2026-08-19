import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json';

describe('provider-neutral real database verifier', () => {
  const scriptPath = resolve(process.cwd(), 'scripts/verify-provider-neutral-withdrawals.mjs');

  it('is registered as an explicit isolated-database command', () => {
    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts['verify:withdrawal-db']).toBe('node scripts/verify-provider-neutral-withdrawals.mjs');
  });

  it('checks the required safety and settlement behaviors without printing secrets', () => {
    const source = readFileSync(scriptPath, 'utf8');
    expect(source).toContain('WITHDRAWAL_TEST_DATABASE_URL');
    expect(source).toContain('WITHDRAWAL_TEST_DB_CONFIRM');
    expect(source).toContain('destination self-verification denial');
    expect(source).toContain('dual approval');
    expect(source).toContain('append-only ledger');
    expect(source).toContain('evidence authorization');
    expect(source).toContain('replay idempotency');
    expect(source).not.toContain('console.log(process.env');
  });
});
