// P2 — Member 2: Vendor, Outlet & Catalogue validation schemas
// EVERY API route in this domain MUST pass request body through .parse() or .safeParse()

import { z } from 'zod';
import { databaseUuidSchema } from '@/lib/validation/schemas';
import { TICKET_ENTRY_POLICIES } from '@/lib/tickets/product-ticket-policy';
import { validateMalaysianPhone } from '@/lib/phone/normalize';
import { parseInternationalPhone } from '@/lib/phone/international';
import { malaysiaDateTimeLocalToIso } from '@/lib/datetime/malaysia';
import { isAccommodationPropertyTypeSlug, isOutletBadgeSlug, isProductTypeSlug } from '@/lib/vendor/taxonomy';

// ── Common building blocks ─────────────────────────────────

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');
const optionalUuid = uuid.or(z.literal('')).optional();
const rmMoney = z.number().finite().min(0).max(100_000).multipleOf(0.01);
const slug = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a valid slug (lowercase, hyphens only)');
const productMediaSchema = z.object({
  url: z.string().url().max(2000),
  alt: z.string().trim().max(255).optional(),
}).strict();

export const VENDOR_BUSINESS_TYPES = [
  'restaurant',
  'tour_operator',
  'accommodation',
  'retail',
  'wellness',
  'adventure',
  'other',
] as const;

export const VENDOR_KINDS = ['shop', 'event'] as const;

// ── Vendor ─────────────────────────────────────────────────

export const VENDOR_REGISTER_VALIDATION_KEYS = [
  'registration.validation.name.required',
  'registration.validation.name.invalid',
  'registration.validation.name.min',
  'registration.validation.name.max',
  'registration.validation.description.invalid',
  'registration.validation.description.max',
  'registration.validation.businessType.invalid',
  'registration.validation.businessType.max',
  'registration.validation.legalBusinessName.invalid',
  'registration.validation.legalBusinessName.max',
  'registration.validation.registrationNumber.invalid',
  'registration.validation.registrationNumber.max',
  'registration.validation.contactName.invalid',
  'registration.validation.contactName.max',
  'registration.validation.contactEmail.invalid',
  'registration.validation.contactEmail.format',
  'registration.validation.contactEmail.max',
  'registration.validation.contactPhone.invalid',
  'registration.validation.contactPhone.max',
  'registration.validation.businessAddress.invalid',
  'registration.validation.businessAddress.max',
  'registration.validation.logoUrl.invalid',
  'registration.validation.logoUrl.format',
  'registration.validation.logoUrl.max',
  'registration.validation.coverUrl.invalid',
  'registration.validation.coverUrl.format',
  'registration.validation.coverUrl.max',
] as const;

export type VendorRegisterValidationKey = typeof VENDOR_REGISTER_VALIDATION_KEYS[number];

const vendorRegisterValidationKeySet = new Set<string>(VENDOR_REGISTER_VALIDATION_KEYS);

export function isVendorRegisterValidationKey(message: unknown): message is VendorRegisterValidationKey {
  return typeof message === 'string' && vendorRegisterValidationKeySet.has(message);
}

const vendorRegisterKey = (field: string, rule: string) => `registration.validation.${field}.${rule}`;

export const vendorRegisterSchema = z.object({
  name: z.string({ error: vendorRegisterKey('name', 'required') }).trim().min(2, { error: vendorRegisterKey('name', 'min') }).max(255, { error: vendorRegisterKey('name', 'max') }),
  vendorKind: z.enum(VENDOR_KINDS).default('shop'),
  slug: slug.optional(), // auto-generated from name if not provided
  description: z.string({ error: vendorRegisterKey('description', 'invalid') }).trim().max(2000, { error: vendorRegisterKey('description', 'max') }).optional(),
  businessType: z.enum(VENDOR_BUSINESS_TYPES, { error: vendorRegisterKey('businessType', 'invalid') }).optional().or(z.literal('')),
  legalBusinessName: z.string({ error: vendorRegisterKey('legalBusinessName', 'invalid') }).trim().max(255, { error: vendorRegisterKey('legalBusinessName', 'max') }).optional(),
  registrationNumber: z.string({ error: vendorRegisterKey('registrationNumber', 'invalid') }).trim().max(120, { error: vendorRegisterKey('registrationNumber', 'max') }).optional(),
  contactName: z.string({ error: vendorRegisterKey('contactName', 'invalid') }).trim().max(255, { error: vendorRegisterKey('contactName', 'max') }).optional(),
  contactEmail: z.string({ error: vendorRegisterKey('contactEmail', 'invalid') }).trim().email({ error: vendorRegisterKey('contactEmail', 'format') }).max(255, { error: vendorRegisterKey('contactEmail', 'max') }).optional().or(z.literal('')),
  contactPhone: z.string({ error: vendorRegisterKey('contactPhone', 'invalid') }).trim().max(50, { error: vendorRegisterKey('contactPhone', 'max') }).refine(
    (phone) => phone === '' || (/^[+()\d.\-\s]+$/.test(phone) && (
      phone.startsWith('+') ? parseInternationalPhone(phone).ok : validateMalaysianPhone(phone)
    )),
    { error: vendorRegisterKey('contactPhone', 'invalid') },
  ).optional(),
  businessAddress: z.string({ error: vendorRegisterKey('businessAddress', 'invalid') }).trim().max(500, { error: vendorRegisterKey('businessAddress', 'max') }).optional(),
  logoUrl: z.string({ error: vendorRegisterKey('logoUrl', 'invalid') }).url({ error: vendorRegisterKey('logoUrl', 'format') }).max(2000, { error: vendorRegisterKey('logoUrl', 'max') }).optional().or(z.literal('')),
  coverUrl: z.string({ error: vendorRegisterKey('coverUrl', 'invalid') }).url({ error: vendorRegisterKey('coverUrl', 'format') }).max(2000, { error: vendorRegisterKey('coverUrl', 'max') }).optional().or(z.literal('')),
}).strict();

export type VendorRegisterInput = z.input<typeof vendorRegisterSchema>;

export const vendorUpdateSchema = vendorRegisterSchema.omit({ vendorKind: true }).partial();

export const vendorApproveSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_information']),
  reason: z.string().max(500).optional(),
}).strict().refine(
  (data) => data.action === 'approve' || (data.reason && data.reason.length >= 5),
  { message: 'Reject or information request requires a reason of at least 5 characters', path: ['reason'] },
);

export const vendorSuspendSchema = z.object({
  action: z.enum(['suspend', 'unsuspend']),
  reason: z.string().max(500).optional(),
}).strict();

// ── Outlet ─────────────────────────────────────────────────

export const FOOD_SERVICE_MODES = ["dine_in", "takeaway"] as const;

const uniqueControlledSlugs = (isAllowed: (slug: string) => boolean, max: number) => z.array(z.string().min(1).max(64))
  .max(max)
  .refine((slugs) => new Set(slugs).size === slugs.length, 'Duplicate values are not allowed')
  .refine((slugs) => slugs.every(isAllowed), 'Contains an unsupported value');
const outletBadgeSlugsSchema = uniqueControlledSlugs(isOutletBadgeSlug, 3);
const accommodationTypeSlugsSchema = uniqueControlledSlugs(isAccommodationPropertyTypeSlug, 7);
const productTypeSlugsSchema = uniqueControlledSlugs(isProductTypeSlug, 9);

export const outletCreateSchema = z.object({
  name: z.string().trim().min(2).max(255),
  slug: slug.optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postcode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  operatingHours: z.record(z.string(), z.object({
    open: z.string(),
    close: z.string(),
    closed: z.boolean().optional(),
    note: z.string().max(500).optional(),
  }).strict()).optional(),
  welcomeMessage: z.string().trim().max(500).optional().or(z.literal('')),
  welcomeEnabled: z.boolean().optional(),
  // §11.1.5 accessibility — null/undefined = not specified (the day-1 default).
  wheelchairAccessible: z.boolean().nullable().optional(),
  petFriendly: z.boolean().nullable().optional(),
  foodServiceModes: z.array(z.enum(FOOD_SERVICE_MODES)).min(1).max(2)
    .refine((modes) => new Set(modes).size === modes.length)
    .default(["dine_in", "takeaway"]),
  badgeSlugs: outletBadgeSlugsSchema.default([]),
  accommodationTypeSlugs: accommodationTypeSlugsSchema.default([]),
}).strict();

// .partial() keeps .default(), which would add foodServiceModes to every update (blocking managers'
// hours edits and resetting food modes). Updates only change what the vendor actually sent.
export const outletUpdateSchema = outletCreateSchema.partial().extend({
  foodServiceModes: z.array(z.enum(FOOD_SERVICE_MODES)).min(1).max(2)
    .refine((modes) => new Set(modes).size === modes.length)
    .optional(),
  badgeSlugs: outletBadgeSlugsSchema.optional(),
  accommodationTypeSlugs: accommodationTypeSlugsSchema.optional(),
});

// ── Product ────────────────────────────────────────────────

export const productCreateSchema = z.object({
  name: z.string().trim().min(2).max(255),
  slug: slug.optional(),
  description: z.string().trim().max(5000).optional(),
  productType: z.enum(['product', 'activity', 'experience', 'food', 'digital', 'service']),
  requiresBooking: z.boolean().default(false),
  ticketEntryPolicy: z.enum(TICKET_ENTRY_POLICIES).default('single_entry'),
  ticketEntryLimit: z.number().int().min(1).max(1000).default(1),
  ticketValidityDays: z.number().int().min(1).max(365).optional(),
  basePrice: rmMoney.min(0.01),
  categoryId: optionalUuid.transform((value) => value || undefined),
  typeSlugs: productTypeSlugsSchema.default([]),
  coverUrl: z.string().url().max(2000).optional().or(z.literal('')),
  tags: z.array(z.string().max(50)).max(20).optional(),
  submissionMode: z.enum(['draft', 'review']).default('review'),
  availableStock: z.number().int().min(0).max(999_999).optional(),
  lowStockThreshold: z.number().int().min(0).max(999_999).optional(),
  defaultCapacity: z.number().int().min(1).max(10_000).optional(),
  digitalAssetUrl: z.string().url().max(2000).optional().or(z.literal('')),
  digitalAssetName: z.string().max(255).optional(),
  digitalAssetType: z.string().max(120).optional(),
  digitalAssetSize: z.number().int().min(0).max(100_000_000).optional(),
  gallery: z.array(productMediaSchema).max(8).optional(),
  outletId: uuid,
}).strict();

export const productUpdateSchema = productCreateSchema.partial().omit({ outletId: true }).extend({
  typeSlugs: productTypeSlugsSchema.optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
});

export const productTaxonomyUpdateSchema = z.object({
  typeSlugs: productTypeSlugsSchema,
}).strict();

// ── Variant ────────────────────────────────────────────────

export const variantCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  priceOffset: z.number().finite().min(-100_000).max(100_000).multipleOf(0.01).default(0),
  isDefault: z.boolean().default(false),
  sku: z.string().max(100).optional(),
}).strict();

export const variantUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  priceOffset: z.number().finite().min(-100_000).max(100_000).multipleOf(0.01).optional(),
  isDefault: z.boolean().optional(),
  sku: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
  quantity: z.number().int().min(0).max(999_999).optional(), // inventory update
}).strict();

// ── Booking Slot ───────────────────────────────────────────

const slotCreateFields = {
  productId: uuid,
  outletId: uuid,
  capacity: z.number().int().min(1).max(10_000),
  priceOverride: rmMoney.optional(),
};

function isValidSlotTimeRange(data: { startsAt: string; endsAt: string }) {
  return new Date(data.endsAt) > new Date(data.startsAt);
}

export const slotCreateSchema = z.object({
  ...slotCreateFields,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
}).refine(
  isValidSlotTimeRange,
  { message: 'End time must be after start time', path: ['endsAt'] },
);

const malaysiaDateTimeLocal = z.string().transform((value, context) => {
  try {
    return malaysiaDateTimeLocalToIso(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid local date and time' });
    return z.NEVER;
  }
});

/** Accepts the Malaysia wall times emitted by the vendor form and returns the API timestamp shape. */
export const slotFormSchema = z.object({
  ...slotCreateFields,
  startsAt: malaysiaDateTimeLocal,
  endsAt: malaysiaDateTimeLocal,
  priceOverride: z.union([
    rmMoney,
    z.literal('').transform(() => undefined),
    z.string().regex(/^\d+(?:\.\d{1,2})?$/).transform(Number).pipe(rmMoney),
  ]).optional(),
}).strict().refine(
  isValidSlotTimeRange,
  { message: 'End time must be after start time', path: ['endsAt'] },
);

export const slotUpdateSchema = z.object({
  capacity: z.number().int().min(1).max(10_000).optional(),
  priceOverride: rmMoney.nullable().optional(),
  status: z.enum(['available', 'full', 'cancelled', 'expired']).optional(),
}).strict();

// ── Voucher ────────────────────────────────────────────────

export const voucherCreateSchema = z.object({
  code: z.string().trim().min(3).max(50).toUpperCase(),
  name: z.string().trim().min(2).max(255),
  voucherType: z.enum(['percent', 'fixed', 'bogo']),
  discountValue: rmMoney.min(0.01).optional(),
  minSpend: rmMoney.default(0),
  maxUses: z.number().int().min(1).max(100_000).optional(),
  perCustomerLimit: z.number().int().min(1).max(100_000).nullable().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  redemptionMode: z.enum(['online', 'in_store', 'both']).default('online'),
  isClaimable: z.boolean().default(true),
  outletId: uuid.optional(), // null = all outlets under this vendor
  productId: optionalUuid,
  buyQuantity: z.number().int().min(1).max(999).optional(),
  freeQuantity: z.number().int().min(1).max(999).optional(),
}).strict().refine(
  (data) => data.voucherType !== 'percent' || (data.discountValue !== undefined && data.discountValue <= 100),
  { message: 'Percent discount must be between 0 and 100', path: ['discountValue'] },
).refine(
  (data) => data.voucherType === 'bogo' || data.discountValue !== undefined,
  { message: 'Discount value is required for percentage and fixed vouchers', path: ['discountValue'] },
).refine(
  (data) => data.voucherType !== 'bogo' || (data.productId && data.buyQuantity && data.freeQuantity),
  { message: 'BOGO vouchers require a product, buy quantity and free quantity', path: ['productId'] },
).superRefine((data, context) => {
  if (data.validFrom && data.validUntil && new Date(data.validUntil) <= new Date(data.validFrom)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Valid until must be after valid from', path: ['validUntil'] });
  }
});

export const voucherUpdateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  voucherType: z.enum(['percent', 'fixed', 'bogo']).optional(),
  discountValue: rmMoney.min(0.01).optional(),
  minSpend: rmMoney.optional(),
  maxUses: z.number().int().min(1).max(100_000).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(100_000).nullable().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  redemptionMode: z.enum(['online', 'in_store', 'both']).optional(),
  isClaimable: z.boolean().optional(),
  outletId: uuid.nullable().optional(),
  productId: optionalUuid.nullable().optional(),
  buyQuantity: z.number().int().min(1).max(999).nullable().optional(),
  freeQuantity: z.number().int().min(1).max(999).nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const priceRuleCreateSchema = z.object({
  ruleType: z.enum(['date_range', 'group_size', 'weekend', 'peak', 'off_peak', 'bundle', 'tiered']),
  label: z.string().trim().min(2).max(100),
  multiplier: z.number().finite().positive().max(100).optional(),
  fixedAmount: rmMoney.optional(),
  validFrom: z.string().date().optional(),
  validUntil: z.string().date().optional(),
  minQuantity: z.number().int().min(1).max(999_999).optional(),
  bundleProductIds: z.array(uuid).max(50).optional(),
  priority: z.number().int().min(-1000).max(1000).optional(),
}).strict();

export const priceRuleUpdateSchema = priceRuleCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
}).strict();

// ── Voucher Validation (used by Member 4 Cart) ─────────────

export const voucherValidateSchema = z.object({
  code: z.string().trim().min(1).max(50).toUpperCase(),
  cartSubtotal: rmMoney,
  vendorId: uuid.optional(),
  intent: z.enum(['view', 'apply']).default('apply'),
  items: z.array(z.object({
    productId: uuid,
    outletId: uuid.optional(),
    quantity: z.number().int().positive(),
    unitPrice: rmMoney,
  })).max(100).optional(),
}).strict();

// ── Fulfil ─────────────────────────────────────────────────

export const fulfilSchema = z.object({
  status: z.enum(['ready', 'fulfilled']),
}).strict();

export const vendorBatchSchema = z.object({
  entity: z.enum(['products', 'outlets', 'vouchers', 'orders', 'bookings', 'slots']),
  action: z.enum(['archive', 'restore', 'close', 'activate', 'deactivate', 'ready', 'fulfilled', 'check_in', 'cancel']),
  ids: z.array(uuid).max(10_000).default([]),
  selectAllFiltered: z.boolean().default(false),
  filters: z.record(z.string(), z.string()).default({}),
}).strict();

export const contentReviewSchema = z.object({
  entityType: z.enum(['outlet', 'product', 'voucher', 'hotel_profile']),
  entityId: uuid,
  action: z.enum(['approve', 'change_requested', 'reject']),
  note: z.string().trim().max(500).optional(),
  /** Snapshot version the reviewer saw; all catalogue entities are guarded by this token. */
  expectedVersion: z.string().trim().datetime({ offset: true }).max(64),
}).strict().superRefine((data, context) => {
  if (data.action !== 'approve' && (!data.note || data.note.length < 10)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['note'],
      message: `${data.action === 'reject' ? 'Reject' : 'Request changes'} requires a reason of at least 10 characters`,
    });
  }
});

// ── Vendor event promotions ─────────────────────────────────

export const eventPromotionSubmitSchema = z.object({
  title: z.string().trim().min(3).max(120),
  details: z.string().trim().min(10).max(2000),
  startDate: z.string().date(),
  endDate: z.string().date(),
  posterUrl: z.string().url().max(2000),
}).strict().refine(
  (data) => data.endDate >= data.startDate,
  { message: 'End date must be on or after the start date', path: ['endDate'] },
);

// Resubmit carries the same fields — the RPC only accepts them when the
// entry is currently changes_requested or approved (awaiting payment) — see
// 20260928030000 migration. (The admin review schema for this feature lives
// in lib/validation/schemas.ts, alongside kycReviewSchema, since it's admin-
// not vendor-facing input.)
export const eventPromotionResubmitSchema = eventPromotionSubmitSchema;

// ── Vendor-Fair Event: campaign registration (a vendor joining an event) ─
// Each product entry either picks an existing catalog product (by id) or
// defines a new-for-this-event item (name+price+optional photo) — the
// latter is never written into the vendor's real /vendor/products catalog,
// it only ever exists on the registration. See 20260928180000 migration.

// Every event listing carries its own price, item type and daily quantity,
// whether it references a catalog product or is new for the event.
const campaignListingFields = {
  price: z.number().min(0).max(999_999.99),
  dailyQuantity: z.number().int().min(0).max(10_000),
  itemKind: z.enum(['product', 'service']),
};

export const campaignRegistrationProductSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), productId: databaseUuidSchema, ...campaignListingFields }).strict(),
  z.object({
    kind: z.literal('new'),
    name: z.string().trim().min(2).max(120),
    imageUrl: z.string().url().max(2000).nullable(),
    ...campaignListingFields,
  }).strict(),
]);

/** What a vendor may change on a listing without re-review: stock and on/off, never price. */
export const campaignListingUpdateSchema = z.object({
  dailyQuantity: z.number().int().min(0).max(10_000),
  active: z.boolean(),
}).strict();

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** A pickup window at one event location: every day (slotDate null) or one extra date. */
export const pickupSlotSchema = z.object({
  registrationId: databaseUuidSchema,
  slotId: databaseUuidSchema.nullable().optional(),
  slotDate: z.iso.date().nullable(),
  startsAt: clockTime,
  endsAt: clockTime,
  capacity: z.number().int().min(1).max(10_000),
}).strict().refine((slot) => slot.endsAt > slot.startsAt, { message: 'End time must be after start time', path: ['endsAt'] });

export const campaignRegistrationSubmitSchema = z.object({
  stallNumber: z.string().trim().max(40).default(''),
  stallDescription: z.string().trim().min(10).max(2000),
  stallPosterUrl: z.string().url().max(2000),
  products: z.array(campaignRegistrationProductSchema).min(1).max(30),
}).strict();

export const campaignRegistrationResubmitSchema = campaignRegistrationSubmitSchema;

// ── Export inferred types ──────────────────────────────────

export type VendorRegister = z.infer<typeof vendorRegisterSchema>;
export type VendorUpdate = z.infer<typeof vendorUpdateSchema>;
export type VendorApprove = z.infer<typeof vendorApproveSchema>;
export type ContentReview = z.infer<typeof contentReviewSchema>;
export type VendorSuspend = z.infer<typeof vendorSuspendSchema>;
export type OutletCreate = z.infer<typeof outletCreateSchema>;
export type OutletUpdate = z.infer<typeof outletUpdateSchema>;
export type ProductCreate = z.infer<typeof productCreateSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type VariantCreate = z.infer<typeof variantCreateSchema>;
export type VariantUpdate = z.infer<typeof variantUpdateSchema>;
export type SlotCreate = z.infer<typeof slotCreateSchema>;
export type SlotFormInput = z.input<typeof slotFormSchema>;
export type SlotUpdate = z.infer<typeof slotUpdateSchema>;
export type VoucherCreate = z.infer<typeof voucherCreateSchema>;
export type VoucherUpdate = z.infer<typeof voucherUpdateSchema>;
export type PriceRuleCreate = z.infer<typeof priceRuleCreateSchema>;
export type PriceRuleUpdate = z.infer<typeof priceRuleUpdateSchema>;
export type VoucherValidate = z.infer<typeof voucherValidateSchema>;
export type FulfilUpdate = z.infer<typeof fulfilSchema>;
export type VendorBatch = z.infer<typeof vendorBatchSchema>;
export type EventPromotionSubmit = z.infer<typeof eventPromotionSubmitSchema>;
export type EventPromotionResubmit = z.infer<typeof eventPromotionResubmitSchema>;
export type CampaignRegistrationProduct = z.infer<typeof campaignRegistrationProductSchema>;
export type CampaignRegistrationSubmit = z.infer<typeof campaignRegistrationSubmitSchema>;
export type CampaignRegistrationResubmit = z.infer<typeof campaignRegistrationResubmitSchema>;
export type CampaignListingUpdate = z.infer<typeof campaignListingUpdateSchema>;
export type PickupSlotInput = z.infer<typeof pickupSlotSchema>;

// Hotel profile (hotel property page plan, Task 4.2). Submitted for admin review; never written live directly.
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
export const hotelProfileSchema = z.object({
  about: z.string().trim().max(2000),
  amenityCodes: z.array(z.string().regex(/^[a-z0-9_]{2,40}$/)).max(40),
  checkInTime: hhmm,
  checkOutTime: hhmm,
  policies: z.string().trim().max(2000),
  photos: z.array(z.string().url()).max(20),
  // Same limits as outletCreateSchema, so outlet-form edits always fit the hotel profile.
  name: z.string().trim().min(2).max(255).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postcode: z.string().trim().max(20).optional(),
  phone: z.string().trim().max(50).optional(),
  country: z.string().trim().max(100).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
}).strict();
export type HotelProfile = z.infer<typeof hotelProfileSchema>;
