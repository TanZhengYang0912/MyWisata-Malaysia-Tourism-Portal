import { parseInternationalPhone } from '@/lib/phone/international';
import { z } from 'zod';
export const checkoutContactSchema = z.object({
  email: z.string({ error: issue => issue.input === undefined ? 'CONTACT_EMAIL_REQUIRED' : 'CONTACT_EMAIL_INVALID' }).trim().min(1, 'CONTACT_EMAIL_REQUIRED').email('CONTACT_EMAIL_INVALID').max(254, 'CONTACT_EMAIL_INVALID'),
  name: z.string({ error: 'CONTACT_NAME_INVALID' }).trim().min(1, 'CONTACT_NAME_INVALID').max(100, 'CONTACT_NAME_INVALID').nullable().optional(),
  phone: z.string({ error: 'CONTACT_PHONE_INVALID' }).trim().min(5, 'CONTACT_PHONE_INVALID').max(30, 'CONTACT_PHONE_INVALID').refine(value => parseInternationalPhone(value).ok, 'CONTACT_PHONE_INVALID').transform(value => { const parsed = parseInternationalPhone(value); return parsed.ok ? parsed.e164 : value; }).nullable().optional(),
}).strict();
