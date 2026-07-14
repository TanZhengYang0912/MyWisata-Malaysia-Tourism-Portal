import { describe, expect, it } from 'vitest';
import { contentReviewSchema } from '@/lib/validation/vendor-schemas';

const validId = '11111111-1111-4111-8111-111111111111';

describe('contentReviewSchema', () => {
  it('accepts request changes with a meaningful note', () => {
    const result = contentReviewSchema.safeParse({
      entityType: 'product',
      entityId: validId,
      action: 'change_requested',
      note: 'Please add a clearer product image and update the availability details.',
    });

    expect(result.success).toBe(true);
  });

  it('requires a meaningful note when requesting changes or rejecting', () => {
    for (const action of ['change_requested', 'reject'] as const) {
      const result = contentReviewSchema.safeParse({
        entityType: 'product',
        entityId: validId,
        action,
        note: 'no',
      });

      expect(result.success).toBe(false);
    }
  });
});
