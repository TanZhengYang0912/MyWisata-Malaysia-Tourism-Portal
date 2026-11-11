import { z } from 'zod';

const label = z.string().trim().min(1).max(60);
const code = z.string().regex(/^[a-z0-9_]{2,40}$/, 'Use lowercase letters, numbers and underscores');

export const createHotelAmenitySchema = z.object({
  code,
  labelEn: label,
  labelMs: label,
  labelZh: label,
  icon: z.string().trim().min(1).max(40),
}).strict();

export const toggleHotelAmenitySchema = z.object({ code, isActive: z.boolean() }).strict();
