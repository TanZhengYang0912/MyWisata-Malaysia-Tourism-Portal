import { z } from 'zod';
import { INTEREST_SLUGS } from '@/backend/domains/preferences';

// ── Identity (name + location) ────────────────────────────────────────────────
export const identitySchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  city:     z.string().trim().min(1).max(100),
  country:  z.string().trim().min(1).max(100).default('Malaysia'),
}).strict();

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
// straight to listings. travelStyle now holds the real §11.1 vocabulary.
export const preferenceSurveySchema = z.object({
  interests:         z.array(z.enum(INTEREST_SLUGS as [string, ...string[]])).min(1).max(8),
  travelStyle:       z.enum(['budget_backpacker', 'mid_range', 'luxury', 'business', 'family_group']),
  budgetRange:       z.enum(['budget', 'mid_range', 'luxury']),
  mobilityNeeds:     z.enum(['none', 'limited', 'wheelchair']).default('none'),
  groupComposition:  z.array(z.enum(['solo', 'couple', 'friends', 'family', 'senior'])).max(5).default([]),
  petFriendly:       z.boolean().default(false),
  preferredRadiusKm: z.number().int().min(0).max(500).default(20),
  notes:             z.string().trim().max(500).optional(),
}).strict();

export type IdentityInput         = z.infer<typeof identitySchema>;
export type AvatarConfirmInput    = z.infer<typeof avatarConfirmSchema>;
export type BioInput              = z.infer<typeof bioSchema>;
export type PreferenceSurveyInput = z.infer<typeof preferenceSurveySchema>;
