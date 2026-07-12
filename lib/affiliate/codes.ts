// P4 — Affiliate code generator. Pure, no framework/DB imports.

// Uppercase alphanumeric, excludes ambiguous characters 0/O and 1/I.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** Generates a candidate code like "AF-7KXQPM". Caller must check DB uniqueness. */
export function generateAffiliateCode(): string {
  let suffix = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `AF-${suffix}`;
}
