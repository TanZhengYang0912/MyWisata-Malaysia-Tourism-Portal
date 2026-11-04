import { describe, expect, it } from "vitest";
import { samePersonalTravelDetails, sameSavedTravellerInput, type PersonalTravelDetails, type SavedTravellerInput } from "@/lib/profile/travel-details";

const personal: PersonalTravelDetails = {
  legalName: "Tan Zheng Yang", dateOfBirth: "1990-01-01", gender: "male", nationalityCode: "MY",
  emergencyContact: { name: "Tan Mei", relationship: "sibling", phone: "+60123456789" },
};

describe("travel detail no-op comparison", () => {
  it("ignores record metadata and detects business changes", () => {
    expect(samePersonalTravelDetails({ ...personal }, personal)).toBe(true);
    expect(samePersonalTravelDetails({ ...personal, gender: "other" }, personal)).toBe(false);
    expect(samePersonalTravelDetails({ ...personal, emergencyContact: null }, personal)).toBe(false);
  });

  it("compares saved-traveller contact fields without merging people", () => {
    const traveller: SavedTravellerInput = { ...personal, legalName: personal.legalName!, contactPhone: "+60112223333", relationship: "friend" };
    expect(sameSavedTravellerInput({ ...traveller }, traveller)).toBe(true);
    expect(sameSavedTravellerInput({ ...traveller, contactPhone: "+60112223334" }, traveller)).toBe(false);
  });
});
