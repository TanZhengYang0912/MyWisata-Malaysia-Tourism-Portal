// Vendor-Fair Event Participation — vendor-side data access.
// See Docs/plans/2026-09-28-1732-vendor-fair-event-participation.md.

import type { SupabaseClient } from '@supabase/supabase-js';
import { apiFail } from '@/lib/validation/schemas';
import type { CampaignListingUpdate, CampaignRegistrationResubmit, CampaignRegistrationSubmit, PickupSlotInput } from '@/lib/validation/vendor-schemas';

export type CampaignRegistrationStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'withdrawn' | 'removed';

export interface VendorCampaignProduct {
  id: string;
  name: string;
  /** The listing's own event price. */
  price: number;
  imageUrl: string | null;
  /** The referenced catalog product, or null for an item that exists only for this event. */
  productId: string | null;
  itemKind: 'product' | 'service';
  dailyQuantity: number;
  active: boolean;
}

export interface VendorCampaignRegistration {
  id: string;
  campaignId: string;
  campaignTitle: string;
  locationId: string;
  locationName: string;
  vendorId: string;
  stallNumber: string;
  requestedStallNumber: string | null;
  stallDescription: string;
  stallPosterUrl: string;
  status: CampaignRegistrationStatus;
  rejectionReason: string | null;
  changesRequestedReason: string | null;
  products: VendorCampaignProduct[];
  /** Pickup windows customers choose from when reserving at this location. */
  pickupSlots: VendorPickupSlot[];
  createdAt: string;
}

export interface VendorPickupSlot {
  id: string;
  /** null = offered every day of the location; a date = extra slot on that day only. */
  slotDate: string | null;
  startsAt: string;
  endsAt: string;
  /** Maximum items across all reservations in this slot on one day. */
  capacity: number;
}

type RegistrationRow = {
  id: string;
  campaign_id: string;
  event_location_id: string;
  vendor_id: string;
  stall_number: string | null;
  requested_stall_number: string | null;
  stall_description: string;
  stall_poster_url: string;
  status: CampaignRegistrationStatus;
  rejection_reason: string | null;
  changes_requested_reason: string | null;
  created_at: string;
  promotion_campaigns: { title: string } | { title: string }[] | null;
  location: { name: string } | { name: string }[] | null;
};

type ProductRow = {
  id: string;
  registration_id: string;
  product_id: string | null;
  name: string | null;
  price: number | null;
  image_url: string | null;
  position: number;
  item_kind: 'product' | 'service';
  daily_quantity: number;
  active: boolean;
  products: { name: string; base_price: number; cover_url: string | null } | { name: string; base_price: number; cover_url: string | null }[] | null;
};

function single<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const REGISTRATION_COLUMNS = 'id,campaign_id,event_location_id,vendor_id,stall_number,requested_stall_number,stall_description,stall_poster_url,status,rejection_reason,changes_requested_reason,created_at,promotion_campaigns(title),location:promotion_campaign_locations(name)';
const PRODUCT_COLUMNS = 'id,registration_id,product_id,name,price,image_url,position,item_kind,daily_quantity,active,products(name,base_price,cover_url)';

function toProduct(row: ProductRow): VendorCampaignProduct {
  const product = single(row.products);
  return {
    id: row.id,
    name: product?.name ?? row.name ?? '',
    price: Number(row.price ?? product?.base_price ?? 0),
    imageUrl: product?.cover_url ?? row.image_url,
    productId: row.product_id,
    itemKind: row.item_kind,
    dailyQuantity: row.daily_quantity,
    active: row.active,
  };
}

async function loadProducts(db: SupabaseClient, registrationIds: string[]): Promise<Map<string, VendorCampaignProduct[]>> {
  const byRegistration = new Map<string, VendorCampaignProduct[]>();
  if (registrationIds.length === 0) return byRegistration;
  const { data, error } = await db.from('promotion_campaign_vendor_products')
    .select(PRODUCT_COLUMNS)
    .in('registration_id', registrationIds)
    .order('position', { ascending: true });
  if (error) throw new Error(`Failed to load registration products: ${error.message}`);
  for (const row of (data ?? []) as unknown as ProductRow[]) {
    const list = byRegistration.get(row.registration_id) ?? [];
    list.push(toProduct(row));
    byRegistration.set(row.registration_id, list);
  }
  return byRegistration;
}

type PickupSlotRow = { id: string; registration_id: string; slot_date: string | null; starts_at: string; ends_at: string; capacity: number };

async function loadPickupSlots(db: SupabaseClient, registrationIds: string[]): Promise<Map<string, VendorPickupSlot[]>> {
  const byRegistration = new Map<string, VendorPickupSlot[]>();
  if (registrationIds.length === 0) return byRegistration;
  const { data, error } = await db.from('promotion_campaign_pickup_slots')
    .select('id,registration_id,slot_date,starts_at,ends_at,capacity')
    .in('registration_id', registrationIds)
    .order('slot_date', { ascending: true, nullsFirst: true })
    .order('starts_at', { ascending: true });
  if (error) throw new Error(`Failed to load pickup slots: ${error.message}`);
  for (const row of (data ?? []) as PickupSlotRow[]) {
    const list = byRegistration.get(row.registration_id) ?? [];
    list.push({ id: row.id, slotDate: row.slot_date, startsAt: row.starts_at.slice(0, 5), endsAt: row.ends_at.slice(0, 5), capacity: row.capacity });
    byRegistration.set(row.registration_id, list);
  }
  return byRegistration;
}

function toRegistration(row: RegistrationRow, products: VendorCampaignProduct[], pickupSlots: VendorPickupSlot[] = []): VendorCampaignRegistration {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignTitle: single(row.promotion_campaigns)?.title ?? '',
    locationId: row.event_location_id,
    locationName: single(row.location)?.name ?? '',
    vendorId: row.vendor_id,
    stallNumber: row.stall_number ?? '',
    requestedStallNumber: row.requested_stall_number ?? null,
    stallDescription: row.stall_description,
    stallPosterUrl: row.stall_poster_url,
    status: row.status,
    rejectionReason: row.rejection_reason,
    changesRequestedReason: row.changes_requested_reason,
    products,
    pickupSlots,
    createdAt: row.created_at,
  };
}

export async function getMyCampaignRegistrations(db: SupabaseClient, vendorId: string): Promise<VendorCampaignRegistration[]> {
  const { data, error } = await db
    .from('promotion_campaign_vendors')
    .select(REGISTRATION_COLUMNS)
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load campaign registrations: ${error.message}`);
  const rows = (data ?? []) as unknown as RegistrationRow[];
  const ids = rows.map((row) => row.id);
  const [productsByRegistration, slotsByRegistration] = await Promise.all([loadProducts(db, ids), loadPickupSlots(db, ids)]);
  return rows.map((row) => toRegistration(row, productsByRegistration.get(row.id) ?? [], slotsByRegistration.get(row.id) ?? []));
}

function toProductPayload(products: CampaignRegistrationSubmit['products']) {
  return products.map((product) => {
    const listing = { price: product.price, dailyQuantity: product.dailyQuantity, itemKind: product.itemKind };
    return product.kind === 'existing'
      ? { productId: product.productId, ...listing }
      : { name: product.name, imageUrl: product.imageUrl, ...listing };
  });
}

/**
 * Submits via the SECURITY DEFINER RPC (not a plain insert) — it needs to
 * atomically write the registration plus every product row, and validate
 * each picked product actually belongs to this vendor. Auth-bound client:
 * the RPC checks auth.uid() for ownership itself.
 */
export async function submitCampaignRegistration(
  authDb: SupabaseClient,
  locationId: string,
  vendorId: string,
  input: CampaignRegistrationSubmit,
): Promise<{ ok: true; id: string } | { ok: false; code: 'forbidden' | 'campaign_not_open' | 'already_registered' | 'invalid' | 'unknown' }> {
  const { data, error } = await authDb.rpc('submit_campaign_vendor_registration', {
    p_location_id: locationId,
    p_vendor_id: vendorId,
    p_stall_number: input.stallNumber,
    p_stall_description: input.stallDescription,
    p_stall_poster_url: input.stallPosterUrl,
    p_products: toProductPayload(input.products),
  });
  if (!error) return { ok: true, id: data as string };
  if (error.message.includes('forbidden')) return { ok: false, code: 'forbidden' };
  if (error.message.includes('campaign_not_open') || error.message.includes('location_cancelled') || error.message.includes('location_ended') || error.message.includes('event_applications_closed')) return { ok: false, code: 'campaign_not_open' };
  // Two simultaneous submits can both pass the RPC's EXISTS check; the second
  // then hits UNIQUE (event_location_id, vendor_id). It is the same outcome.
  if (error.message.includes('already_registered') || error.code === '23505' || error.message.includes('promotion_campaign_vendors_location_vendor_unique')) return { ok: false, code: 'already_registered' };
  if (error.message.includes('invalid') || error.message.includes('required') || error.message.includes('not_owned')) return { ok: false, code: 'invalid' };
  return { ok: false, code: 'unknown' };
}

export async function resubmitCampaignRegistration(
  authDb: SupabaseClient,
  registrationId: string,
  input: CampaignRegistrationResubmit,
): Promise<{ ok: true } | { ok: false; code: 'not_found' | 'not_editable' | 'forbidden' | 'invalid' | 'unknown' }> {
  const { error } = await authDb.rpc('resubmit_campaign_vendor_registration', {
    p_registration_id: registrationId,
    p_stall_number: input.stallNumber,
    p_stall_description: input.stallDescription,
    p_stall_poster_url: input.stallPosterUrl,
    p_products: toProductPayload(input.products),
  });
  if (!error) return { ok: true };
  if (error.message.includes('not_found')) return { ok: false, code: 'not_found' };
  if (error.message.includes('event_approvals_closed') || error.message.includes('campaign_not_open') || error.message.includes('location_cancelled') || error.message.includes('location_ended')) return { ok: false, code: 'not_editable' };
  if (error.message.includes('not_editable')) return { ok: false, code: 'not_editable' };
  if (error.message.includes('forbidden')) return { ok: false, code: 'forbidden' };
  if (error.message.includes('invalid') || error.message.includes('required') || error.message.includes('not_owned')) return { ok: false, code: 'invalid' };
  return { ok: false, code: 'unknown' };
}

/** Stock and on/off only; the RPC checks ownership and that the registration is pending or approved. */
export async function updateCampaignListing(
  authDb: SupabaseClient,
  listingId: string,
  input: CampaignListingUpdate,
): Promise<{ ok: true } | { ok: false; code: 'not_found' | 'forbidden' | 'not_editable' | 'in_use' | 'invalid' | 'unknown' }> {
  const { error } = await authDb.rpc('update_campaign_listing', {
    p_listing_id: listingId,
    p_daily_quantity: input.dailyQuantity,
    p_active: input.active,
  });
  if (!error) return { ok: true };
  if (error.message.includes('event_stock_below_commitments')) return { ok: false, code: 'in_use' };
  if (error.message.includes('not_found')) return { ok: false, code: 'not_found' };
  if (error.message.includes('forbidden')) return { ok: false, code: 'forbidden' };
  if (error.message.includes('not_editable')) return { ok: false, code: 'not_editable' };
  if (error.message.includes('invalid')) return { ok: false, code: 'invalid' };
  return { ok: false, code: 'unknown' };
}

export type PickupSlotFailure = 'not_found' | 'forbidden' | 'not_editable' | 'invalid' | 'outside_hours' | 'outside_dates' | 'duplicate' | 'in_use' | 'unknown';

function pickupSlotFailure(message: string): PickupSlotFailure {
  if (message.includes('not_found')) return 'not_found';
  if (message.includes('forbidden')) return 'forbidden';
  if (message.includes('not_editable')) return 'not_editable';
  if (message.includes('pickup_slot_outside_hours')) return 'outside_hours';
  if (message.includes('pickup_slot_outside_dates')) return 'outside_dates';
  if (message.includes('pickup_slot_duplicate')) return 'duplicate';
  if (message.includes('event_slot_has_commitments') || message.includes('event_capacity_below_commitments') || message.includes('pickup_slot_in_use')) return 'in_use';
  if (message.includes('pickup_slot_invalid')) return 'invalid';
  return 'unknown';
}

export async function saveEventPickupSlot(
  authDb: SupabaseClient,
  input: PickupSlotInput,
): Promise<{ ok: true } | { ok: false; code: PickupSlotFailure }> {
  const { error } = await authDb.rpc('save_event_pickup_slot', {
    p_registration_id: input.registrationId,
    p_slot_id: input.slotId ?? null,
    p_slot_date: input.slotDate,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_capacity: input.capacity,
  });
  return error ? { ok: false, code: pickupSlotFailure(error.message) } : { ok: true };
}

export async function deleteEventPickupSlot(
  authDb: SupabaseClient,
  slotId: string,
): Promise<{ ok: true } | { ok: false; code: PickupSlotFailure }> {
  const { error } = await authDb.rpc('delete_event_pickup_slot', { p_slot_id: slotId });
  return error ? { ok: false, code: pickupSlotFailure(error.message) } : { ok: true };
}

/** Maps a pickup-slot RPC failure to the vendor API response. */
export function pickupSlotFailureResponse(code: PickupSlotFailure) {
  if (code === 'not_found') return apiFail('NOT_FOUND', 'Pickup time not found', 404);
  if (code === 'forbidden') return apiFail('FORBIDDEN', 'You do not have access to this stall', 403);
  if (code === 'not_editable') return apiFail('INVALID_STATE', 'This stall can no longer be changed', 409);
  if (code === 'outside_hours') return apiFail('OUTSIDE_HOURS', 'Pickup times must be within the location hours', 422);
  if (code === 'outside_dates') return apiFail('OUTSIDE_DATES', 'The date must be within the location dates', 422);
  if (code === 'duplicate') return apiFail('DUPLICATE', 'This pickup time already exists', 409);
  if (code === 'in_use') return apiFail('IN_USE', 'Customers have reserved this pickup time', 409);
  if (code === 'invalid') return apiFail('VALIDATION_FAILED', 'The pickup time is invalid', 422);
  return apiFail('DB_ERROR', 'The pickup time could not be saved', 500);
}
