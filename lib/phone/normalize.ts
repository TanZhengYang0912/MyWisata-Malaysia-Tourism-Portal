export function toE164MY(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('60')) return '+' + digits;
  if (digits.startsWith('0'))  return '+60' + digits.slice(1);
  return '+60' + digits;
}

export function validateMalaysianPhone(phone: string): boolean {
  const e164 = toE164MY(phone);
  return /^\+60[1-9]\d{7,9}$/.test(e164);
}
