import { z } from 'zod';

// E.164 format: +[country code][number], 8–15 digits total after +
export const e164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +60123456789)');

export const sendOtpSchema = z.object({
  phone: e164Schema,
}).strict();

export const verifyOtpSchema = z.object({
  phone: e164Schema,
  code:  z.string().min(4).max(8).regex(/^\d+$/, 'Code must be digits only'),
}).strict();

export type SendOtpInput   = z.infer<typeof sendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
