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

  it('loads read-only reward, affiliate, ledger, and fraud review projections', () => {
    expect(routeSource).toContain("get_withdrawal_review_sources");
    expect(routeSource).toContain('reviewSources');
  });

  it('loads authorization-aware settlement proof without direct provider-event reads', () => {
    expect(routeSource).toContain('get_withdrawal_settlement_proof');
    expect(routeSource).toContain('settlementProof');
    expect(routeSource).not.toContain("from('payout_provider_events')");
    expect(routeSource).not.toContain("from('tng_mock_callback_outbox')");
  });
});
