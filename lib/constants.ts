// Shared status enums — must match CHECK constraints in migrations/001_initial_schema.sql

export const USER_STATUS = ['active', 'suspended', 'deleted'] as const;
export const KYC_STATUS  = ['unverified', 'pending', 'approved', 'rejected'] as const;

// ── Verification tier ladder (ADR-025) ────────────────────────────────────────
// Order is authoritative — use meetsMinTier() for comparisons, never string equality.
export const TIER_ORDER = [
  'email_unverified',
  'email_verified',
  'phone_verified',
  'profile_complete',
  'kyc_verified',
] as const;

export type Tier = typeof TIER_ORDER[number];

export const REQUIRED_TIER = {
  CHECKOUT:        'phone_verified',
  BASIC_AI:        'phone_verified',
  RECOMMENDATION:  'profile_complete',
  AFFILIATE_BASIC: 'profile_complete',
  AFFILIATE_FULL:  'kyc_verified',
  WITHDRAWAL:      'kyc_verified',
} as const satisfies Record<string, Tier>;

export function meetsMinTier(actual: string, required: Tier): boolean {
  const ai = TIER_ORDER.indexOf(actual as Tier);
  const ri = TIER_ORDER.indexOf(required);
  return ai !== -1 && ai >= ri;
}

export const VENDOR_STATUS  = ['pending', 'approved', 'rejected', 'suspended'] as const;
export const PRODUCT_STATUS = ['active', 'inactive', 'archived'] as const;
export const SLOT_STATUS    = ['available', 'full', 'cancelled', 'expired'] as const;

export const ORDER_STATUS = [
  'draft', 'pending_payment', 'paid', 'completed', 'cancelled', 'refunded',
] as const;

export const WITHDRAWAL_STATUS = [
  'pending', 'approved', 'rejected', 'processing', 'completed',
] as const;

export const ROLE_NAMES = [
  'super_admin', 'approver', 'vendor_owner', 'outlet_manager', 'customer',
] as const;

export const PRODUCT_TYPES = [
  'product', 'activity', 'experience', 'food', 'digital', 'service',
] as const;

export const PAYMENT_METHODS = ['mock_card', 'stripe_card', 'ewallet', 'bank_transfer', 'wallet', 'wallet_split'] as const;

// Demo OTP code — never send real SMS in demo
export const DEMO_OTP_CODE = '123456';

// Wallet thresholds (sync with platform_settings seed)
export const WALLET_CLEARANCE_DAYS    = 7;
export const HIGH_VALUE_WITHDRAWAL_RM = 500;
export const AFFILIATE_COOKIE_DAYS    = 30;

// Commission rates (sync with commission_rules seed)
export const AFFILIATE_RATE_STANDARD = 0.03;
export const AFFILIATE_RATE_ACTIVE   = 0.05;
export const AFFILIATE_RATE_TOP      = 0.07;

export type UserStatus     = typeof USER_STATUS[number];
export type KycStatus      = typeof KYC_STATUS[number];
export type VendorStatus   = typeof VENDOR_STATUS[number];
export type ProductStatus  = typeof PRODUCT_STATUS[number];
export type OrderStatus    = typeof ORDER_STATUS[number];
export type WithdrawalStatus = typeof WITHDRAWAL_STATUS[number];
export type RoleName       = typeof ROLE_NAMES[number];
export type ProductType    = typeof PRODUCT_TYPES[number];
export type PaymentMethod  = typeof PAYMENT_METHODS[number];
