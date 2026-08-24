import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'app/admin/kyc/page.tsx'), 'utf8');

describe('admin KYC queue data boundary', () => {
  it('loads customer-safe identities from the protected KYC API', () => {
    expect(source).not.toContain('import { getUsers }');
    expect(source).not.toContain('getUsers()');
    expect(source).toContain('body.data?.customers');
    expect(source).toContain('body.data?.verifiedCount');
  });
});
