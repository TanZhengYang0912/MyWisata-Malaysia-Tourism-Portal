import { describe, expect, it } from "vitest";
import { personalTravelDetailsSchema, savedTravellerSchema, travellerPageSchema } from "../travel-details";
import { EMPTY_PERSONAL_DETAILS, EMPTY_TRAVELLER, mapPersonalTravelDetails, travelDetailsToRow } from "@/lib/profile/travel-details";

describe("private travel details validation", () => {
  it("allows optional private values to be cleared explicitly", () => {
    expect(personalTravelDetailsSchema.parse(EMPTY_PERSONAL_DETAILS)).toEqual(EMPTY_PERSONAL_DETAILS);
    expect(mapPersonalTravelDetails(null)).toEqual(EMPTY_PERSONAL_DETAILS);
    expect(travelDetailsToRow(EMPTY_PERSONAL_DETAILS).emergency_contact_phone).toBeNull();
  });
  it("accepts leap days and normalizes nationality independently of residence", () => {
    const parsed = personalTravelDetailsSchema.parse({ ...EMPTY_PERSONAL_DETAILS, dateOfBirth: "2000-02-29", nationalityCode: "cn" });
    expect(parsed.nationalityCode).toBe("CN");
    expect(parsed).not.toHaveProperty("countryCode");
  });
  it.each(["2025-02-29", "2000-13-01", "2000-02-30", "1899-12-31", "2999-01-01", "1/2/2000", "2000-01-01T00:00:00Z"])("rejects invalid or future DOB %s", (dateOfBirth) => {
    expect(personalTravelDetailsSchema.safeParse({ ...EMPTY_PERSONAL_DETAILS, dateOfBirth }).success).toBe(false);
  });
  it("normalizes international phone numbers and preserves a valid emergency contact", () => {
    const parsed = personalTravelDetailsSchema.parse({ ...EMPTY_PERSONAL_DETAILS, emergencyContact: { name: " Aina ", relationship: " sister ", phone: "+60 12-345 6789" } });
    expect(parsed.emergencyContact).toEqual({ name: "Aina", relationship: "sister", phone: "+60123456789" });
  });
  it("rejects incomplete emergency contacts, unsupported countries and invalid phones", () => {
    expect(personalTravelDetailsSchema.safeParse({ ...EMPTY_PERSONAL_DETAILS, emergencyContact: { name: "Aina", relationship: null, phone: "0123456789" } }).success).toBe(false);
    expect(personalTravelDetailsSchema.safeParse({ ...EMPTY_PERSONAL_DETAILS, emergencyContact: { name: "Aina" } }).success).toBe(false);
    expect(personalTravelDetailsSchema.safeParse({ ...EMPTY_PERSONAL_DETAILS, nationalityCode: "ZZ" }).success).toBe(false);
  });
  it("requires saved traveller names and rejects ownership/document/insurance properties", () => {
    expect(savedTravellerSchema.safeParse(EMPTY_TRAVELLER).success).toBe(false);
    expect(savedTravellerSchema.safeParse({ ...EMPTY_TRAVELLER, legalName: "Child Traveller", dateOfBirth: "2020-01-01" }).success).toBe(true);
    for (const extra of [{ user_id: "other" }, { ownerId: "other" }, { passportNumber: "private" }, { insuranceConsent: true }]) {
      expect(savedTravellerSchema.safeParse({ ...EMPTY_TRAVELLER, legalName: "Aina", ...extra }).success).toBe(false);
    }
  });
  it("bounds paging and rejects client page sizes and owner filters", () => {
    expect(travellerPageSchema.parse({})).toEqual({ page: 1 });
    expect(travellerPageSchema.parse({ page: "2" }).page).toBe(2);
    for (const input of [{ page: 0 }, { page: 1.5 }, { page: 1000001 }, { pageSize: 1000 }, { userId: "other" }]) {
      expect(travellerPageSchema.safeParse(input).success).toBe(false);
    }
  });
});
