export type KycOcrReviewStatus = 'matched' | 'mismatch' | 'unreadable' | 'unavailable';

export function requiresManualKycReview(status: KycOcrReviewStatus): boolean {
  return status === 'unavailable' || status === 'unreadable' || status === 'mismatch';
}
