import "server-only";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { createPersonalTravelDetailsSchema, createSavedTravellerSchema, savedTravellerSchema, travellerIdSchema, travellerPageSchema } from "@/lib/validation/travel-details";
import {
  mapPersonalTravelDetails, mapSavedTraveller, travelDetailsToRow, TRAVELLERS_PAGE_SIZE,
  type SavedTravellerRow, type TravelDetailsRow,
} from "@/lib/profile/travel-details";

type Context = { db: Awaited<ReturnType<typeof createClient>>; userId: string };
const PERSONAL_COLUMNS = "legal_name,date_of_birth,gender,nationality_code,emergency_contact_name,emergency_contact_relationship,emergency_contact_phone";
const TRAVELLER_COLUMNS = `id,${PERSONAL_COLUMNS},contact_phone,relationship,created_at,updated_at`;
const unavailable = () => apiFail("TRAVEL_DETAILS_UNAVAILABLE", "Unable to load or save these details. Please retry.", 503);
const missing = () => apiFail("TRAVELLER_NOT_FOUND", "Traveller not found", 404);

/** Cookie-authenticated queries use RLS, plus an explicit active-owner filter. */
async function withOwner(action: (context: Context) => Promise<Response>): Promise<Response> {
  let response: Response;
  try {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user || user.is_anonymous) response = apiFail("UNAUTHORIZED", "Sign in required", 401);
    else {
      const account = await db.from("users").select("status").eq("id", user.id).maybeSingle();
      if (account.error) response = unavailable();
      else if (account.data?.status !== "active") response = apiFail("ACCOUNT_UNAVAILABLE", "Your account cannot access these details", 403);
      else response = await action({ db, userId: user.id });
    }
  } catch { response = unavailable(); }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function getPersonalTravelDetails() {
  return withOwner(async ({ db, userId }) => {
    const { data, error } = await db.from("profile_personal_details").select(PERSONAL_COLUMNS).eq("user_id", userId).maybeSingle();
    return error ? unavailable() : apiOk(mapPersonalTravelDetails(data as TravelDetailsRow | null));
  });
}
export function putPersonalTravelDetails(request: Request) {
  return withOwner(async ({ db, userId }) => {
    const { data: current, error: readError } = await db.from("profile_personal_details")
      .select("emergency_contact_relationship").eq("user_id", userId).maybeSingle();
    if (readError) return unavailable();
    const parsed = await parseBody(request, createPersonalTravelDetailsSchema(current?.emergency_contact_relationship ?? null), { maxBytes: 8192 });
    if (!parsed.ok) return parsed.response;
    const { data, error } = await db.from("profile_personal_details")
      .upsert({ user_id: userId, ...travelDetailsToRow(parsed.data) }, { onConflict: "user_id" })
      .select(PERSONAL_COLUMNS).single();
    return error ? unavailable() : apiOk(mapPersonalTravelDetails(data as TravelDetailsRow));
  });
}
export function clearPersonalTravelDetails() {
  return withOwner(async ({ db, userId }) => {
    const { error } = await db.from("profile_personal_details").delete().eq("user_id", userId);
    return error ? unavailable() : apiOk(mapPersonalTravelDetails(null));
  });
}
export function listSavedTravellers(request: Request) {
  return withOwner(async ({ db, userId }) => {
    const parsed = travellerPageSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return apiFail("INVALID_PAGE", "Choose a valid page", 422);
    const page = parsed.data.page;
    const offset = (page - 1) * TRAVELLERS_PAGE_SIZE;
    const { data, count, error } = await db.from("saved_travellers").select(TRAVELLER_COLUMNS, { count: "exact" })
      .eq("user_id", userId).order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + TRAVELLERS_PAGE_SIZE - 1);
    if (error) return unavailable();
    const total = count ?? 0;
    return apiOk({ travellers: ((data ?? []) as SavedTravellerRow[]).map(mapSavedTraveller), page,
      pageSize: TRAVELLERS_PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / TRAVELLERS_PAGE_SIZE)) });
  });
}
export function createSavedTraveller(request: Request) {
  return withOwner(async ({ db, userId }) => {
    const parsed = await parseBody(request, savedTravellerSchema, { maxBytes: 8192 });
    if (!parsed.ok) return parsed.response;
    const input = parsed.data;
    const { data, error } = await db.from("saved_travellers").insert({
      user_id: userId, ...travelDetailsToRow(input), contact_phone: input.contactPhone, relationship: input.relationship,
    }).select(TRAVELLER_COLUMNS).single();
    return error ? unavailable() : apiOk(mapSavedTraveller(data as SavedTravellerRow), { status: 201 });
  });
}
export function getSavedTraveller(id: string) {
  return withOwner(async ({ db, userId }) => {
    if (!travellerIdSchema.safeParse(id).success) return missing();
    const { data, error } = await db.from("saved_travellers").select(TRAVELLER_COLUMNS)
      .eq("user_id", userId).eq("id", id).maybeSingle();
    return error ? unavailable() : data ? apiOk(mapSavedTraveller(data as SavedTravellerRow)) : missing();
  });
}
/** PUT replaces optional values too; null intentionally clears previously saved data. */
export function putSavedTraveller(request: Request, id: string) {
  return withOwner(async ({ db, userId }) => {
    if (!travellerIdSchema.safeParse(id).success) return missing();
    const { data: current, error: readError } = await db.from("saved_travellers")
      .select("relationship,emergency_contact_relationship").eq("user_id", userId).eq("id", id).maybeSingle();
    if (readError) return unavailable();
    if (!current) return missing();
    const parsed = await parseBody(request, createSavedTravellerSchema({
      relationship: current.relationship,
      emergencyRelationship: current.emergency_contact_relationship,
    }), { maxBytes: 8192 });
    if (!parsed.ok) return parsed.response;
    const input = parsed.data;
    const { data, error } = await db.from("saved_travellers").update({
      ...travelDetailsToRow(input), contact_phone: input.contactPhone, relationship: input.relationship,
    }).eq("user_id", userId).eq("id", id).select(TRAVELLER_COLUMNS).maybeSingle();
    return error ? unavailable() : data ? apiOk(mapSavedTraveller(data as SavedTravellerRow)) : missing();
  });
}
export function deleteSavedTraveller(id: string) {
  return withOwner(async ({ db, userId }) => {
    if (!travellerIdSchema.safeParse(id).success) return missing();
    const { data, error } = await db.from("saved_travellers").delete()
      .eq("user_id", userId).eq("id", id).select("id").maybeSingle();
    return error ? unavailable() : data ? apiOk({ deleted: true }) : missing();
  });
}
