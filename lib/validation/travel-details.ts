import { z } from "zod";
import { isCountryCode } from "@/lib/location/countries";
import { getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
import { malaysiaCalendarDateToIso } from "@/lib/datetime/malaysia";
import { parseInternationalPhone } from "@/lib/phone/international";
import { TRAVEL_GENDERS } from "@/lib/profile/travel-details";

const optionalText = (max: number) => z.string().trim().max(max).nullable().transform((value) => value || null);
const legalName = z.string().trim().min(2).max(100);
const dateOfBirth = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > getMalaysiaDateInputValue()) return false;
  try { malaysiaCalendarDateToIso(value, "start"); return true; } catch { return false; }
}, "Choose a valid birth date that is not in the future").nullable();
const nationalityCode = z.string().trim().toUpperCase().refine(isCountryCode, "Choose a supported country code").nullable();
const phone = z.string().trim().max(40).transform((value, ctx) => {
  const parsed = parseInternationalPhone(value);
  if (!parsed.ok) { ctx.addIssue({ code: "custom", message: "Enter a valid international phone number" }); return z.NEVER; }
  return parsed.e164;
});
const emergencyContact = z.object({
  name: legalName,
  relationship: optionalText(50),
  phone,
}).strict().nullable();
const common = {
  dateOfBirth,
  gender: z.enum(TRAVEL_GENDERS).nullable(),
  nationalityCode,
  emergencyContact,
};
export const personalTravelDetailsSchema = z.object({ legalName: legalName.nullable(), ...common }).strict();
export const savedTravellerSchema = z.object({
  legalName, ...common,
  contactPhone: phone.nullable(),
  relationship: optionalText(50),
}).strict();
export const travellerPageSchema = z.object({ page: z.coerce.number().int().min(1).max(1_000_000).default(1) }).strict();
export const travellerIdSchema = z.string().uuid();
