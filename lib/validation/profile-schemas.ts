import { z } from 'zod';

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
export const preferenceSurveySchema = z.object({
  interests:     z.array(z.string().trim().min(1).max(50)).min(1).max(10),
  travelStyle:   z.enum(['solo', 'couple', 'family', 'group']),
  budgetRange:   z.enum(['budget', 'mid_range', 'luxury']),
  mobilityNeeds: z.enum(['none', 'limited', 'wheelchair']).default('none'),
  preferredDistance: z.enum(['walking', 'nearby', 'travel', 'anywhere', 'no_preference']).default('no_preference'),
}).strict();

export type IdentityInput         = z.infer<typeof identitySchema>;
export type AvatarConfirmInput    = z.infer<typeof avatarConfirmSchema>;
export type BioInput              = z.infer<typeof bioSchema>;
export type PreferenceSurveyInput = z.infer<typeof preferenceSurveySchema>;
