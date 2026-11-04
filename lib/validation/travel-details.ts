import { z } from "zod";
import { isCountryCode } from "@/lib/location/countries";
import { getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
import { malaysiaCalendarDateToIso } from "@/lib/datetime/malaysia";
import { parseInternationalPhone } from "@/lib/phone/international";
import { TRAVEL_GENDERS, TRAVEL_RELATIONSHIPS, type TravelRelationship } from "@/lib/profile/travel-details";

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
function relationship(legacyValue: string | null) {
  const known = z.enum(TRAVEL_RELATIONSHIPS);
  if (!legacyValue || TRAVEL_RELATIONSHIPS.includes(legacyValue as TravelRelationship)) return known.nullable();
  return z.union([known, z.literal(legacyValue)]).nullable();
}
function emergencyContactSchema(legacyRelationship: string | null) {
  return z.object({
  name: legalName,
  relationship: relationship(legacyRelationship),
  phone,
  }).strict().nullable();
}
function common(legacyEmergencyRelationship: string | null) {
  return {
  dateOfBirth,
  gender: z.enum(TRAVEL_GENDERS).nullable(),
  nationalityCode,
  emergencyContact: emergencyContactSchema(legacyEmergencyRelationship),
  };
}
export function createPersonalTravelDetailsSchema(legacyEmergencyRelationship: string | null = null) {
  return z.object({ legalName: legalName.nullable(), ...common(legacyEmergencyRelationship) }).strict();
}
export function createSavedTravellerSchema(options: { relationship: string | null; emergencyRelationship: string | null } = { relationship: null, emergencyRelationship: null }) {
  return z.object({
    legalName, ...common(options.emergencyRelationship),
    contactPhone: phone.nullable(),
    relationship: relationship(options.relationship),
  }).strict();
}
export const personalTravelDetailsSchema = createPersonalTravelDetailsSchema();
export const savedTravellerSchema = createSavedTravellerSchema();
export const travellerPageSchema = z.object({ page: z.coerce.number().int().min(1).max(1_000_000).default(1) }).strict();
export const travellerIdSchema = z.string().uuid();
