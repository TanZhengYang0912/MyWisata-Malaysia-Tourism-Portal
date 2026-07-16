import { z } from 'zod';
import { parseInternationalPhone } from '@/lib/phone/international';

// Accept human-formatted international input but always pass canonical E.164 onward.
export const e164Schema = z.string().transform((value, context) => {
  const parsed = parseInternationalPhone(value);

  if (!parsed.ok) {
    context.addIssue({ code: 'custom', message: parsed.message });
    return z.NEVER;
  }

  return parsed.e164;
});

export const sendOtpSchema = z.object({
  phone: e164Schema,
}).strict();

export const verifyOtpSchema = z.object({
  phone: e164Schema,
  code:  z.string().min(4).max(8).regex(/^\d+$/, 'Code must be digits only'),
}).strict();

export type SendOtpInput   = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
