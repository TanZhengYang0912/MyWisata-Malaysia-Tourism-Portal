export type SupportSensitiveDomain = 'payment' | 'refund' | 'withdrawal' | 'kyc';
export type SupportEvidenceState = 'verified_record' | 'published_kb' | 'unavailable' | 'none';
export type SupportPolicyAction = 'refresh_status' | 'open_record' | 'handoff';

export type PublishedKbEvidence = {
  kind: 'published_kb';
  documentId: string;
  title: string;
  contentVersion: number;
  checkedAt: string;
};

export type VerifiedRecordEvidence = {
  kind: 'verified_record';
  domain: SupportSensitiveDomain;
  status: string;
  checkedAt: string;
  href: string;
};

export type SupportEvidence = PublishedKbEvidence | VerifiedRecordEvidence;
export type CustomerStatusKind = 'orders' | 'bookings' | 'refunds' | 'tickets' | 'withdrawals' | 'kyc';

export interface SupportPolicyDecision {
  canAnswerPolicy: boolean;
  canStateRecord: boolean;
  actions: readonly SupportPolicyAction[];
}

const SENSITIVE_TERMS: Record<SupportSensitiveDomain, RegExp> = {
  refund: /\brefund(?:s|ed|ing)?\b|\breimburse(?:ment|d)?\b|退款|退钱|退費|退费|bayaran balik|pemulangan wang/i,
  withdrawal: /\bwithdraw(?:al|als|n)?\b|\bcash[ -]?out\b|\bpayouts?\b|提现|提現|提款|出金|pengeluaran/i,
  kyc: /\bkyc\b|\bidentity verification\b|\bidentity check\b|\be-?kyc\b|身份验证|身份驗證|身份证|身分證|证件审核|證件審核|身份审核|身份審核|pengesahan identiti/i,
  payment: /\bpayments?\b|\bpay\b|\bpaid\b|\bcharg(?:e|ed|ing)\b|\bdeduct(?:ed|ion)?\b|\btransactions?\b|\bdeposits?\b|\btransfers?\b|\bwallets?\b|\bcommissions?\b|\bfees?\b|\bbank account\b|\bmoney\b|付款|支付|扣款|扣费|扣費|充值|转账|轉帳|到账|到賬|金额|金額|交易|钱包|錢包|佣金|银行|銀行|银行卡|銀行卡|pembayaran|bayaran|dibayar|dikenakan|potongan|dipotong|transaksi|dompet|komisen|akaun bank|pemindahan/i,
};

export function detectSensitiveSupportDomain(question: string): SupportSensitiveDomain | null {
  const normalizedQuestion = question.normalize('NFKC');
  if (SENSITIVE_TERMS.refund.test(normalizedQuestion)) return 'refund';
  if (SENSITIVE_TERMS.withdrawal.test(normalizedQuestion)) return 'withdrawal';
  if (SENSITIVE_TERMS.kyc.test(normalizedQuestion)) return 'kyc';
  if (SENSITIVE_TERMS.payment.test(normalizedQuestion)) return 'payment';
  return null;
}

export function allowedSupportActions(
  _domain: SupportSensitiveDomain,
  evidence: SupportEvidenceState,
): readonly SupportPolicyAction[] {
  const actions: SupportPolicyAction[] = [];
  if (evidence === 'unavailable' || evidence === 'none') {
    actions.push('refresh_status');
  }
  actions.push('open_record', 'handoff');
  return actions;
}

export function allowedCustomerStatusActions(
  kind: CustomerStatusKind,
  evidence: SupportEvidenceState,
): readonly SupportPolicyAction[] {
  const domainByKind: Partial<Record<CustomerStatusKind, SupportSensitiveDomain>> = {
    orders: 'payment',
    refunds: 'refund',
    withdrawals: 'withdrawal',
    kyc: 'kyc',
  };
  const domain = domainByKind[kind];
  return domain
    ? allowedSupportActions(domain, evidence)
    : evidence === 'unavailable' || evidence === 'none'
      ? ['refresh_status', 'open_record', 'handoff']
      : ['open_record', 'handoff'];
}

export function resolveSupportPolicy(
  domain: SupportSensitiveDomain,
  evidence: SupportEvidenceState,
): SupportPolicyDecision {
  const canAnswerPolicy = evidence === 'published_kb';
  const canStateRecord = evidence === 'verified_record';
  return { canAnswerPolicy, canStateRecord, actions: allowedSupportActions(domain, evidence) };
}
