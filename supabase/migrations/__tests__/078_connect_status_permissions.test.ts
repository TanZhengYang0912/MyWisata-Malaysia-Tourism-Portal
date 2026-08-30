import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/legacy-migrations/078_connect_status_permissions.sql'),
  'utf8',
);

describe('078 connect status permissions migration', () => {
  it('allows authenticated and service-role callers while removing anon access', () => {
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION[\s\S]*FROM\s+PUBLIC,\s*anon/i);
    expect(migration).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*TO\s+authenticated,\s*service_role/i);
  });

  it('binds authenticated updates to the caller account', () => {
    expect(migration).toMatch(/auth\.role\(\)\s*=\s*'service_role'/i);
    expect(migration).toMatch(/id\s*=\s*auth\.uid\(\)/i);
  });
});
