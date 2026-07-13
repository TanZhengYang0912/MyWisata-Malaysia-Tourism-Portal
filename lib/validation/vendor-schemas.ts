// P2 — Member 2: Vendor, Outlet & Catalogue validation schemas
// EVERY API route in this domain MUST pass request body through .parse() or .safeParse()

import { z } from 'zod';

// ── Common building blocks ─────────────────────────────────

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID');
const optionalUuid = uuid.or(z.literal('')).optional();
const rmMoney = z.number().finite().min(0).max(100_000).multipleOf(0.01);
const slug = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a valid slug (lowercase, hyphens only)');
const productMediaSchema = z.object({
  url: z.string().url().max(2000),
  alt: z.string().trim().max(255).optional(),
}).strict();

// ── Vendor ─────────────────────────────────────────────────

export const vendorRegisterSchema = z.object({
  name: z.string().trim().min(2).max(255),
  slug: slug.optional(), // auto-generated from name if not provided
  description: z.string().trim().max(2000).optional(),
  businessType: z.string().max(50).optional(),
  logoUrl: z.string().url().max(2000).optional().or(z.literal('')),
  coverUrl: z.string().url().max(2000).optional().or(z.literal('')),
}).strict();

export const vendorUpdateSchema = vendorRegisterSchema.partial();

export const vendorApproveSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(500).optional(),
}).strict().refine(
  (data) => data.action === 'approve' || (data.reason && data.reason.length >= 5),
  { message: 'Reject requires a reason of at least 5 characters', path: ['reason'] },
);

export const vendorSuspendSchema = z.object({
  action: z.enum(['suspend', 'unsuspend']),
  reason: z.string().max(500).optional(),
}).strict();

// ── Outlet ─────────────────────────────────────────────────

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
  })).optional(),
}).strict();

export const outletUpdateSchema = outletCreateSchema.partial();

// ── Product ────────────────────────────────────────────────

export const productCreateSchema = z.object({
  name: z.string().trim().min(2).max(255),
  slug: slug.optional(),
  description: z.string().trim().max(5000).optional(),
  productType: z.enum(['product', 'activity', 'experience', 'food', 'digital']),
  requiresBooking: z.boolean().default(false),
  basePrice: rmMoney.min(0.01),
  categoryId: uuid.optional(),
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

export const productUpdateSchema = productCreateSchema.partial().omit({ outletId: true }).extend({ status: z.enum(['active', 'inactive', 'archived']).optional() });

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

export const slotCreateSchema = z.object({
  productId: uuid,
  outletId: uuid,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  capacity: z.number().int().min(1).max(10_000),
  priceOverride: rmMoney.optional(),
}).strict().refine(
  (data) => new Date(data.endsAt) > new Date(data.startsAt),
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
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
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
);

export const voucherUpdateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  voucherType: z.enum(['percent', 'fixed', 'bogo']).optional(),
  discountValue: rmMoney.min(0.01).optional(),
  minSpend: rmMoney.optional(),
  maxUses: z.number().int().min(1).max(100_000).nullable().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
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
  items: z.array(z.object({
    productId: uuid,
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
  entityType: z.enum(['outlet', 'product', 'voucher']),
  entityId: uuid,
  action: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
}).strict();

// ── Export inferred types ──────────────────────────────────

export type VendorRegister = z.infer<typeof vendorRegisterSchema>;
export type VendorApprove = z.infer<typeof vendorApproveSchema>;
export type VendorSuspend = z.infer<typeof vendorSuspendSchema>;
export type OutletCreate = z.infer<typeof outletCreateSchema>;
export type OutletUpdate = z.infer<typeof outletUpdateSchema>;
export type ProductCreate = z.infer<typeof productCreateSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type VariantCreate = z.infer<typeof variantCreateSchema>;
export type VariantUpdate = z.infer<typeof variantUpdateSchema>;
export type SlotCreate = z.infer<typeof slotCreateSchema>;
export type SlotUpdate = z.infer<typeof slotUpdateSchema>;
export type VoucherCreate = z.infer<typeof voucherCreateSchema>;
export type VoucherUpdate = z.infer<typeof voucherUpdateSchema>;
export type PriceRuleCreate = z.infer<typeof priceRuleCreateSchema>;
export type PriceRuleUpdate = z.infer<typeof priceRuleUpdateSchema>;
export type VoucherValidate = z.infer<typeof voucherValidateSchema>;
export type FulfilUpdate = z.infer<typeof fulfilSchema>;
export type VendorBatch = z.infer<typeof vendorBatchSchema>;
