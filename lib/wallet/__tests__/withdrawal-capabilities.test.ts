import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'lib/wallet/withdrawal-capabilities.ts';
const capabilityModule = existsSync(path) ? await import('@/lib/wallet/withdrawal-capabilities') : null;
const deriveWithdrawalAvailableActions = capabilityModule?.deriveWithdrawalAvailableActions;

describe('deriveWithdrawalAvailableActions', () => {
  it('returns the governed review actions for a pending request', () => {
    expect(deriveWithdrawalAvailableActions).toBeTypeOf('function');
    if (!deriveWithdrawalAvailableActions) return;
    expect(deriveWithdrawalAvailableActions({ status: 'pending', riskLevel: 'low', riskOverridden: false, isSuperAdmin: false })).toEqual(['approve', 'hold', 'reject']);
  });

  it('allows resume plus governed hold/reject actions for held requests', () => {
    expect(deriveWithdrawalAvailableActions).toBeTypeOf('function');
    if (!deriveWithdrawalAvailableActions) return;
    expect(deriveWithdrawalAvailableActions({ status: 'hold', riskLevel: 'review', riskOverridden: false, isSuperAdmin: false })).toEqual(['hold', 'reject', 'resume']);
  });

  it('keeps fraud override exclusive to an unresolved high-risk Super Admin review', () => {
    expect(deriveWithdrawalAvailableActions).toBeTypeOf('function');
    if (!deriveWithdrawalAvailableActions) return;
    expect(deriveWithdrawalAvailableActions({ status: 'pending', riskLevel: 'high', riskOverridden: false, isSuperAdmin: true })).toContain('fraud-override');
    expect(deriveWithdrawalAvailableActions({ status: 'pending', riskLevel: 'high', riskOverridden: false, isSuperAdmin: false })).not.toContain('fraud-override');
    expect(deriveWithdrawalAvailableActions({ status: 'paid', riskLevel: 'high', riskOverridden: false, isSuperAdmin: true })).toEqual(['fraud-override']);
  });
});
