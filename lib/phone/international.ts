import { parsePhoneNumberFromString } from "libphonenumber-js";

export type InternationalPhoneParseResult =
  | { ok: true; e164: string }
  | { ok: false; message: "Enter a valid international phone number" };

const INVALID_PHONE = (): InternationalPhoneParseResult => ({
  ok: false,
  message: "Enter a valid international phone number",
});

export function parseInternationalPhone(value: string): InternationalPhoneParseResult {
  const input = value.trim();
  if (!input.startsWith("+")) return INVALID_PHONE();

  const parsed = parsePhoneNumberFromString(input, { extract: false });
  if (!parsed || !parsed.isValid()) return INVALID_PHONE();

  return { ok: true, e164: parsed.number };
}
