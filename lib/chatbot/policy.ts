export type SupportSensitiveDomain = 'payment' | 'refund' | 'withdrawal' | 'kyc';
export type SupportEvidenceState = 'verified_record' | 'published_kb' | 'unavailable' | 'none';
export type SupportPolicyAction = 'refresh_status' | 'open_record' | 'handoff';

export interface SupportPolicyDecision {
  canAnswerPolicy: boolean;
  canStateRecord: boolean;
  actions: readonly SupportPolicyAction[];
}

export function resolveSupportPolicy(
  domain: SupportSensitiveDomain,
  evidence: SupportEvidenceState,
): SupportPolicyDecision {
  const canAnswerPolicy = evidence === 'published_kb';
  const canStateRecord = evidence === 'verified_record';
  const actions: SupportPolicyAction[] = ['handoff'];

  if (domain === 'payment') {
    if (evidence === 'unavailable' || evidence === 'none') actions.unshift('refresh_status');
    actions.unshift('open_record');
  } else if (domain === 'refund' || domain === 'withdrawal' || domain === 'kyc') {
    actions.unshift('open_record');
    if (evidence === 'unavailable') actions.unshift('refresh_status');
  }

  return { canAnswerPolicy, canStateRecord, actions };
}
