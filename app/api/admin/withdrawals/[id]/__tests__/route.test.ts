import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  resolve(process.cwd(), 'app/api/admin/withdrawals/[id]/route.ts'),
  'utf8',
);

describe('GET /api/admin/withdrawals/:id relationship contract', () => {
  it('selects KYC submissions through the customer user_id relationship', () => {
    expect(routeSource).toContain(
      'kyc_submissions!kyc_submissions_user_id_fkey(status, reviewed_at, document_type)',
    );
  });
});
