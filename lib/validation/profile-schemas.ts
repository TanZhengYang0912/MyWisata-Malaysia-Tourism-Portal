import { z } from 'zod';
import { INTEREST_SLUGS } from '@/backend/domains/preferences';
import { isCountryCode } from '@/lib/location/countries';

// ── Identity (name + location) ────────────────────────────────────────────────
export const identitySchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  city:     z.string().trim().min(1).max(100),
  country:  z.string().trim().min(1).max(100).default('Malaysia'),
  cityId: z.string().uuid().nullable().optional(),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.countryCode && !isCountryCode(value.countryCode)) {
    context.addIssue({ code: 'custom', path: ['countryCode'], message: 'Country code is not supported' });
  }
  if (value.cityId && !value.countryCode) {
    context.addIssue({ code: 'custom', path: ['countryCode'], message: 'Country code is required for a catalogue city' });
  }
});

// ── Avatar confirm ────────────────────────────────────────────────────────────
export const avatarConfirmSchema = z.object({
  path: z.string().min(1).max(500),
}).strict();

// ── Bio ───────────────────────────────────────────────────────────────────────
export const bioSchema = z.object({
  bio: z.string().trim().min(30).max(200),
}).strict();

// ── Preference survey ─────────────────────────────────────────────────────────
// interests are category slugs (backend/domains/preferences.ts), so they join
// straight to listings.
export const preferenceSurveySchema = z.object({
  interests:         z.array(z.enum(INTEREST_SLUGS as [string, ...string[]])).min(1).max(4),
  budgetRange:       z.enum(['budget', 'mid_range', 'luxury']),
  mobilityNeeds:     z.enum(['none', 'limited', 'wheelchair']).default('none'),
  petFriendly:       z.boolean().default(false),
  preferredRadiusKm: z.number().int().min(0).max(500).default(20),
  notes:             z.string().trim().max(500).optional(),
}).strict();

export type IdentityInput         = z.infer<typeof identitySchema>;
export type AvatarConfirmInput    = z.infer<typeof avatarConfirmSchema>;
export type BioInput              = z.infer<typeof bioSchema>;
export type PreferenceSurveyInput = z.infer<typeof preferenceSurveySchema>;
