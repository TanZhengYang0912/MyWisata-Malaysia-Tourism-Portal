export type PasswordValidation = { ok: true } | { ok: false; message: string };

export function validatePassword(password: string): PasswordValidation {
  if (password.length < 10) return { ok: false, message: "Password must be at least 10 characters." };
  if (!/[A-Z]/.test(password)) return { ok: false, message: "Password must include an uppercase letter." };
  if (!/[a-z]/.test(password)) return { ok: false, message: "Password must include a lowercase letter." };
  if (!/[0-9]/.test(password)) return { ok: false, message: "Password must include a number." };
  return { ok: true };
}
