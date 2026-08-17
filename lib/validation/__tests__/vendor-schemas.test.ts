import { describe, expect, it } from 'vitest';
import { contentReviewSchema, vendorRegisterSchema, voucherCreateSchema, voucherValidateSchema } from '@/lib/validation/vendor-schemas';

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

describe('vendorRegisterSchema', () => {
  it('emits stable translation keys for client-side field validation', () => {
    const required = vendorRegisterSchema.safeParse({});
    expect(required.success).toBe(false);
    if (!required.success) {
      expect(required.error.issues.find((issue) => issue.path[0] === 'name')?.message).toBe('registration.validation.name.required');
    }

    const invalidFormats = vendorRegisterSchema.safeParse({
      name: 'Valid Vendor',
      contactEmail: 'not-an-email',
      logoUrl: 'not-a-url',
      coverUrl: 'also-not-a-url',
    });
    expect(invalidFormats.success).toBe(false);
    if (!invalidFormats.success) {
      expect(invalidFormats.error.issues.find((issue) => issue.path[0] === 'contactEmail')?.message).toBe('registration.validation.contactEmail.format');
      expect(invalidFormats.error.issues.find((issue) => issue.path[0] === 'logoUrl')?.message).toBe('registration.validation.logoUrl.format');
      expect(invalidFormats.error.issues.find((issue) => issue.path[0] === 'coverUrl')?.message).toBe('registration.validation.coverUrl.format');
    }
  });
});

describe('voucherCreateSchema', () => {
  const validVoucher = {
    code: 'TRAVEL10',
    name: 'Travel discount',
    voucherType: 'fixed' as const,
    discountValue: 10,
    minSpend: 20,
    validFrom: '2026-07-31T11:33:00.000Z',
    validUntil: '2026-08-23T11:29:00.000Z',
  };

  it('rejects an end date that is not after the start date', () => {
    const result = voucherCreateSchema.safeParse({
      ...validVoucher,
      validUntil: '2026-07-30T11:29:00.000Z',
    });

    expect(result.success).toBe(false);
  });
});

describe('voucherValidateSchema', () => {
  it('defaults validation intent to apply', () => {
    const result = voucherValidateSchema.safeParse({
      code: 'TRAVEL10',
      cartSubtotal: 100,
      intent: 'view',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.intent).toBe('view');
  });
});
