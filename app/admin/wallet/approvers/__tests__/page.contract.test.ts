import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pagePath = resolve(process.cwd(), 'app/admin/wallet/approvers/page.tsx');

describe('wallet approver governance page', () => {
  it('uses the shared Admin page skeleton', () => {
    const source = readFileSync(pagePath, 'utf8');

    expect(source).toContain('AdminPageShell');
    expect(source).toContain('AdminPageHeader');
    expect(source).toContain('<AdminPageShell>');
    expect(source).toContain('<AdminPageHeader');
  });

  it('allows only one explicit role change per confirmation', () => {
    const source = readFileSync(pagePath, 'utf8');

    expect(source).toContain('AdminConfirmDialog');
    expect(source).toContain('pendingRoleAction');
    expect(source).not.toContain('selectedApproverIds');
    expect(source).not.toContain('revokeApproversBatch');
    expect(source).not.toContain('Promise.all(selected');
  });
});
