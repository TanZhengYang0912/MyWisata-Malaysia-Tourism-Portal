import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapCustomerKycSubmission, safeKycReasonCopy } from '../customer-submission';

describe('customer KYC submission mapping', () => {
  it('maps a reviewed submission without storage or fingerprint metadata', () => {
    const submission = mapCustomerKycSubmission({
      id: 'submission-1',
      status: 'rejected',
      document_type: 'national_id',
      queue_position: 4,
      created_at: '2026-07-14T10:00:00.000Z',
      reviewed_at: '2026-07-14T11:00:00.000Z',
      review_reason_code: 'document_unreadable',
      review_reason_detail: 'The front image is too blurry to verify.',
      ic_hash: 'must-not-leak',
      storage_path: 'must-not-leak',
    });

    expect(submission).toEqual({
      id: 'submission-1',
      status: 'rejected',
      docType: 'national_id',
      queuePosition: 4,
      submittedAt: '2026-07-14T10:00:00.000Z',
      reviewedAt: '2026-07-14T11:00:00.000Z',
      reviewReasonCode: 'document_unreadable',
      reviewReasonDetail: null,
    });
    expect(JSON.stringify(submission)).not.toMatch(/path|hash|storage/i);
  });

  it('provides safe customer-facing copy for a review reason', () => {
    expect(safeKycReasonCopy('document_unreadable')).toBe('We could not clearly read your document. Please submit clear, well-lit images.');
    expect(safeKycReasonCopy('unknown')).toBe('We could not complete verification with this submission. Please review your documents and submit a new one.');
  });

  it('does not select an internal KYC note in customer APIs', () => {
    const submissionRoute = readFileSync(resolve(process.cwd(), 'app/api/kyc/submission/route.ts'), 'utf8');
    const profileRoute = readFileSync(resolve(process.cwd(), 'app/api/profile/me/route.ts'), 'utf8');

    expect(submissionRoute).not.toContain('review_reason_code,review_reason_detail');
    expect(profileRoute).not.toContain('review_reason_code,review_reason_detail');
  });
});
