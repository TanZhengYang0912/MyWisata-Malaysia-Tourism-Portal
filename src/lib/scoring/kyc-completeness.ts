// P-TMF (Trust & Money Flow) — TMF-1 Identity Trust
// Rule-based (NOT AI). Renamed from "AI-assisted KYC review" for honesty.
// Every check is traceable — outputs `checks` so admin sees WHY.

import type { KycSubmissionRow, UserRow } from '@/types/database';

export type RiskLevel = 'low_risk' | 'needs_review' | 'high_risk';

export interface KycCompletenessResult {
  checks: {
    document_uploaded: boolean;
    document_type_valid: boolean;
    full_name_present: boolean;
    phone_verified: boolean;
    email_verified: boolean;
  };
  passed: number;   // out of 5
  level: RiskLevel;
  version: 'checklist-v1';
}

/**
 * Returns a checklist score for admin KYC review.
 * NOT machine learning — a 5-item boolean checklist with fixed thresholds.
 * Public-facing name: "KYC Completeness Checklist".
 */
export function kycCompletenessScore(
  submission: KycSubmissionRow,
  profile: UserRow,
): KycCompletenessResult {
  const checks = {
    document_uploaded:   !!submission.document_url,
    document_type_valid: ['national_id', 'passport'].includes(submission.document_type),
    full_name_present:   !!profile.full_name && profile.full_name.length > 3,
    phone_verified:      !!profile.phone_verified_at,
    email_verified:      !!profile.email_verified_at,
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const level: RiskLevel =
    passed >= 5 ? 'low_risk' :
    passed >= 3 ? 'needs_review' :
                  'high_risk';

  return { checks, passed, level, version: 'checklist-v1' };
}

export function riskLevelColour(level: RiskLevel): 'green' | 'yellow' | 'red' {
  return level === 'low_risk' ? 'green' : level === 'needs_review' ? 'yellow' : 'red';
}
