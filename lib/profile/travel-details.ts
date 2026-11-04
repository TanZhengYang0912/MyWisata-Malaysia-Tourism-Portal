/**
 * Private travel-data contract (v1) for future reservation consumers.
 *
 * GET/PUT/DELETE /api/profile/personal-details manages the signed-in person's
 * optional details. GET/POST /api/profile/travellers lists/creates other people;
 * GET/PUT/DELETE /api/profile/travellers/:id addresses one owned record.
 * Cookie authentication is required: active, non-anonymous owners only. Responses
 * use { data, error } and Cache-Control: private, no-store. Never pass owner IDs.
 * PUT is a full replacement: send every field, using null to clear optional data.
 * Names are user-declared; these records are not KYC evidence or consent to insure.
 *
 * List query: ?page=1; fixed 25 rows ordered by createdAt descending, then ID.
 * No filters or page-size overrides; total is the count of this owner's rows.
 * Errors: 401 session, 403 account, 404 absent/unowned ID, 422 validation,
 * 413 body above 8192 bytes, 503 unavailable. Last successful edit wins.
 *
 * Future booking/insurance integrations must confirm selected participants and
 * their required fields, then copy the chosen values into an order snapshot.
 * Editing/deleting saved people must not rewrite historical orders or policies.
 * Stored DOB supports future birthday campaigns; issuance/annual-limit rules
 * are separate. No document numbers, automatic insurance or coupon issuance.
 */
export const TRAVEL_GENDERS = ["female", "male", "other", "prefer_not_to_say"] as const;
export type TravelGender = typeof TRAVEL_GENDERS[number];
export const TRAVEL_RELATIONSHIPS = ["spouse", "parent", "child", "sibling", "relative", "friend", "colleague", "other"] as const;
export type TravelRelationship = typeof TRAVEL_RELATIONSHIPS[number];
export const TRAVELLERS_PAGE_SIZE = 25;

export type EmergencyContact = { name: string; relationship: string | null; phone: string };
export type PersonalTravelDetails = {
  legalName: string | null;
  dateOfBirth: string | null;
  gender: TravelGender | null;
  nationalityCode: string | null;
  emergencyContact: EmergencyContact | null;
};
export type SavedTravellerInput = Omit<PersonalTravelDetails, "legalName"> & {
  legalName: string;
  contactPhone: string | null;
  relationship: string | null;
};
export type SavedTraveller = SavedTravellerInput & { id: string; createdAt: string; updatedAt: string };
export type TravellersPage = { travellers: SavedTraveller[]; page: number; pageSize: number; total: number; pages: number };
export const EMPTY_PERSONAL_DETAILS: PersonalTravelDetails = {
  legalName: null, dateOfBirth: null, gender: null, nationalityCode: null, emergencyContact: null,
};
export const EMPTY_TRAVELLER: SavedTravellerInput = {
  ...EMPTY_PERSONAL_DETAILS, legalName: "", contactPhone: null, relationship: null,
};

export type TravelDetailsRow = {
  legal_name: string | null;
  date_of_birth: string | null;
  gender: TravelGender | null;
  nationality_code: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
};
export type SavedTravellerRow = TravelDetailsRow & {
  id: string; legal_name: string; contact_phone: string | null; relationship: string | null;
  created_at: string; updated_at: string;
};
export function mapPersonalTravelDetails(row: TravelDetailsRow | null): PersonalTravelDetails {
  if (!row) return { ...EMPTY_PERSONAL_DETAILS };
  return {
    legalName: row.legal_name, dateOfBirth: row.date_of_birth, gender: row.gender,
    nationalityCode: row.nationality_code,
    emergencyContact: row.emergency_contact_name && row.emergency_contact_phone ? {
      name: row.emergency_contact_name, relationship: row.emergency_contact_relationship,
      phone: row.emergency_contact_phone,
    } : null,
  };
}
export function mapSavedTraveller(row: SavedTravellerRow): SavedTraveller {
  return {
    ...mapPersonalTravelDetails(row), legalName: row.legal_name,
    id: row.id, contactPhone: row.contact_phone, relationship: row.relationship,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
export function travelDetailsToRow(input: PersonalTravelDetails) {
  return {
    legal_name: input.legalName, date_of_birth: input.dateOfBirth, gender: input.gender,
    nationality_code: input.nationalityCode,
    emergency_contact_name: input.emergencyContact?.name ?? null,
    emergency_contact_relationship: input.emergencyContact?.relationship ?? null,
    emergency_contact_phone: input.emergencyContact?.phone ?? null,
  };
}

/** Compare validated business fields only; row IDs and timestamps are metadata. */
export function samePersonalTravelDetails(left: PersonalTravelDetails, right: PersonalTravelDetails): boolean {
  return left.legalName === right.legalName
    && left.dateOfBirth === right.dateOfBirth
    && left.gender === right.gender
    && left.nationalityCode === right.nationalityCode
    && left.emergencyContact?.name === right.emergencyContact?.name
    && (left.emergencyContact?.relationship ?? null) === (right.emergencyContact?.relationship ?? null)
    && left.emergencyContact?.phone === right.emergencyContact?.phone;
}

export function sameSavedTravellerInput(left: SavedTravellerInput, right: SavedTravellerInput): boolean {
  return samePersonalTravelDetails(left, right)
    && left.legalName === right.legalName
    && left.contactPhone === right.contactPhone
    && left.relationship === right.relationship;
}
