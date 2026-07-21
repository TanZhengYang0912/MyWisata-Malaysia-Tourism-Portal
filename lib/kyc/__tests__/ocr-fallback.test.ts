import { describe, expect, it } from 'vitest';
import { requiresManualKycReview } from '../ocr-policy';

describe('OCR fallback policy', () => {
  it('keeps AI assistance non-authoritative and routes uncertain results to human review', () => {
    expect(requiresManualKycReview('matched')).toBe(false);
    expect(requiresManualKycReview('mismatch')).toBe(true);
    expect(requiresManualKycReview('unreadable')).toBe(true);
    expect(requiresManualKycReview('unavailable')).toBe(true);
  });
});
