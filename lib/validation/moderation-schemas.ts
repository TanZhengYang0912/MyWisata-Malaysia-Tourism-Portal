import { z } from 'zod';

export const addCustomWordSchema = z.object({
  term: z.string().trim().min(1).max(100),
  category: z.enum(['profanity', 'slur']),
  language: z.string().trim().max(40).optional(),
}).strict();
export type AddCustomWordInput = z.infer<typeof addCustomWordSchema>;

export const updateCustomWordSchema = z.object({
  isActive: z.boolean(),
}).strict();
export type UpdateCustomWordInput = z.infer<typeof updateCustomWordSchema>;
