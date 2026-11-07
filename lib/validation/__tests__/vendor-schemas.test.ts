import { describe, expect, it } from 'vitest';
import {
  campaignListingUpdateSchema,
  campaignRegistrationProductSchema,
  contentReviewSchema,
  pickupSlotSchema,
  productCreateSchema,
  productTaxonomyUpdateSchema,
  productUpdateSchema,
  outletCreateSchema,
  outletUpdateSchema,
  vendorRegisterSchema,
  vendorUpdateSchema,
  voucherCreateSchema,
  voucherValidateSchema,
} from '@/lib/validation/vendor-schemas';

const validId = '11111111-1111-4111-8111-111111111111';

describe('productCreateSchema', () => {
  const product = {
    name: 'QA product',
    productType: 'product' as const,
    basePrice: 12.5,
    outletId: validId,
  };

  it('allows no category and normalizes the empty form selection away', () => {
    const result = productCreateSchema.safeParse({ ...product, categoryId: '' });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.categoryId).toBeUndefined();
  });

  it('retains a valid category ID and rejects malformed category IDs', () => {
    expect(productCreateSchema.safeParse({ ...product, categoryId: validId }).success).toBe(true);
    expect(productCreateSchema.safeParse({ ...product, categoryId: 'retail' }).success).toBe(false);
  });

  it('accepts only controlled product types and rejects duplicates', () => {
    expect(productCreateSchema.safeParse({ ...product, typeSlugs: ['nyonya', 'seafood'] }).success).toBe(true);
    expect(productCreateSchema.safeParse({ ...product, typeSlugs: ['made-up'] }).success).toBe(false);
    expect(productCreateSchema.safeParse({ ...product, typeSlugs: ['nature', 'nature'] }).success).toBe(false);
  });
});

describe('taxonomy-only update schemas', () => {
  it('does not materialize defaults for omitted metadata on ordinary updates', () => {
    expect(productUpdateSchema.parse({ name: 'Updated name' })).not.toHaveProperty('typeSlugs');
    expect(outletUpdateSchema.parse({ name: 'Updated outlet' })).not.toHaveProperty('badgeSlugs');
    expect(outletUpdateSchema.parse({ name: 'Updated outlet' })).not.toHaveProperty('accommodationTypeSlugs');
  });

  it('rejects arbitrary badge slugs and accepts the fixed list', () => {
    expect(outletCreateSchema.safeParse({ name: 'Valid outlet', badgeSlugs: ['hidden_gem'] }).success).toBe(true);
    expect(outletCreateSchema.safeParse({ name: 'Valid outlet', badgeSlugs: ['vendor-made-up'] }).success).toBe(false);
    expect(outletCreateSchema.safeParse({ name: 'Valid outlet', badgeSlugs: ['hidden_gem', 'hidden_gem'] }).success).toBe(false);
  });

  it('allows the owner endpoint to update only product type metadata', () => {
    expect(productTaxonomyUpdateSchema.safeParse({ typeSlugs: ['nature'] }).success).toBe(true);
    expect(productTaxonomyUpdateSchema.safeParse({ typeSlugs: ['nature'], basePrice: 10 }).success).toBe(false);
  });
});

describe('contentReviewSchema', () => {
  it('accepts request changes with a meaningful note', () => {
    const result = contentReviewSchema.safeParse({
      entityType: 'product',
      entityId: validId,
      expectedVersion: '2026-10-22T00:00:00.000Z',
      action: 'change_requested',
      note: 'Please add a clearer product image and update the availability details.',
    });

    expect(result.success).toBe(true);
  });

  it('requires the version the reviewer opened for every entity type', () => {
    for (const entityType of ['outlet', 'product', 'voucher', 'hotel_profile'] as const) {
      expect(contentReviewSchema.safeParse({
        entityType,
        entityId: validId,
        action: 'approve',
      }).success).toBe(false);
      expect(contentReviewSchema.safeParse({
        entityType,
        entityId: validId,
        action: 'approve',
        expectedVersion: '2026-10-22T00:00:00.000Z',
      }).success).toBe(true);
    }
  });

  it('requires a meaningful note when requesting changes or rejecting', () => {
    for (const action of ['change_requested', 'reject'] as const) {
      const result = contentReviewSchema.safeParse({
        entityType: 'product',
        entityId: validId,
        expectedVersion: '2026-10-22T00:00:00.000Z',
        action,
        note: 'no',
      });

      expect(result.success).toBe(false);
    }
  });
});

describe('vendorRegisterSchema', () => {
  it('defaults legacy applications to shop and accepts event vendor applications', () => {
    expect(vendorRegisterSchema.parse({ name: 'Valid Vendor' }).vendorKind).toBe('shop');
    expect(vendorRegisterSchema.parse({ name: 'Event Vendor', vendorKind: 'event' }).vendorKind).toBe('event');
    expect(vendorRegisterSchema.safeParse({ name: 'Invalid Vendor', vendorKind: 'staff' }).success).toBe(false);
  });

  it('accepts an international contact number for the selected country', () => {
    const results = ['+12025550142', '+60177143951', '+601123456789', '0177143951'].map((contactPhone) => (
      vendorRegisterSchema.safeParse({ name: 'Valid Vendor', contactPhone })
    ));

    expect(results.every((result) => result.success)).toBe(true);
  });

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

describe('vendorUpdateSchema', () => {
  it('does not allow an existing vendor to change its immutable kind', () => {
    expect(vendorUpdateSchema.safeParse({ vendorKind: 'event' }).success).toBe(false);
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

describe('event listing schemas', () => {
  const listing = { price: 12.5, dailyQuantity: 20, itemKind: 'product' as const };

  it('requires price, daily quantity and type on every event item', () => {
    expect(campaignRegistrationProductSchema.safeParse({ kind: 'existing', productId: validId, ...listing }).success).toBe(true);
    expect(campaignRegistrationProductSchema.safeParse({ kind: 'new', name: 'Kuih lapis', imageUrl: null, ...listing, price: 0, itemKind: 'service' }).success).toBe(true);
    expect(campaignRegistrationProductSchema.safeParse({ kind: 'existing', productId: validId }).success).toBe(false);
  });

  it('rejects negative prices, fractional or oversized quantities and unknown types', () => {
    const base = { kind: 'existing', productId: validId, ...listing };
    expect(campaignRegistrationProductSchema.safeParse({ ...base, price: -1 }).success).toBe(false);
    expect(campaignRegistrationProductSchema.safeParse({ ...base, dailyQuantity: 1.5 }).success).toBe(false);
    expect(campaignRegistrationProductSchema.safeParse({ ...base, dailyQuantity: 10_001 }).success).toBe(false);
    expect(campaignRegistrationProductSchema.safeParse({ ...base, itemKind: 'ticket' }).success).toBe(false);
  });

  it('lets a vendor change only stock and on/off after submission', () => {
    expect(campaignListingUpdateSchema.safeParse({ dailyQuantity: 0, active: false }).success).toBe(true);
    expect(campaignListingUpdateSchema.safeParse({ dailyQuantity: 5, active: true, price: 1 }).success).toBe(false);
  });
});

describe('pickupSlotSchema', () => {
  const slot = { registrationId: validId, slotDate: null, startsAt: '10:00', endsAt: '11:30', capacity: 20 };

  it('accepts an every-day window and an extra window on one date', () => {
    expect(pickupSlotSchema.safeParse(slot).success).toBe(true);
    expect(pickupSlotSchema.safeParse({ ...slot, slotDate: '2026-10-05' }).success).toBe(true);
  });

  it('rejects windows that end before they start, bad times and bad limits', () => {
    expect(pickupSlotSchema.safeParse({ ...slot, endsAt: '09:00' }).success).toBe(false);
    expect(pickupSlotSchema.safeParse({ ...slot, startsAt: '25:00' }).success).toBe(false);
    expect(pickupSlotSchema.safeParse({ ...slot, capacity: 0 }).success).toBe(false);
    expect(pickupSlotSchema.safeParse({ ...slot, slotDate: '5/10/2026' }).success).toBe(false);
  });

  it('rejects dates that match the format but do not exist on the calendar', () => {
    expect(pickupSlotSchema.safeParse({ ...slot, slotDate: '2026-02-31' }).success).toBe(false);
    expect(pickupSlotSchema.safeParse({ ...slot, slotDate: '2026-13-01' }).success).toBe(false);
    expect(pickupSlotSchema.safeParse({ ...slot, slotDate: '2024-02-29' }).success).toBe(true);
  });
});
