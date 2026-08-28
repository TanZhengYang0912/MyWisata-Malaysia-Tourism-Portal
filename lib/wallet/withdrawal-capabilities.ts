import type { WithdrawalRiskLevel } from './withdrawal-risk';

export type WithdrawalAvailableAction =
  | 'approve'
  | 'hold'
  | 'reject'
  | 'resume'
  | 'fraud-override';

export function deriveWithdrawalAvailableActions(input: {
  status: string;
  riskLevel: WithdrawalRiskLevel;
  riskOverridden: boolean;
  isSuperAdmin: boolean;
}): WithdrawalAvailableAction[] {
  const actions: WithdrawalAvailableAction[] = [];
  if (['pending', 'pending_second_approval'].includes(input.status)) actions.push('approve');
  if (['pending', 'pending_second_approval', 'approved', 'hold', 'overdue'].includes(input.status)) {
    actions.push('hold', 'reject');
  }
  if (input.status === 'hold') actions.push('resume');
  if (input.isSuperAdmin && input.riskLevel === 'high' && !input.riskOverridden) {
    actions.push('fraud-override');
  }
  return actions;
}
