import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { databaseUuidSchema as uuid, apiFail } from "@/lib/validation/schemas";
import { canMergeCartItemLines, cartItemKey, sameStayDetails } from "@/backend/core/helpers";
import { mapCartItem } from "@/backend/domains/commerce";
import { guestPrivateResponse, isSameOriginMutation, readGuestJson, reserveGuestRateLimit, resolveGuestSession } from "@/lib/checkout/guest-session";
import { stayBookingDetailsSchema } from "@/lib/validation/schemas";

const itemSchema = z.object({ activityId: uuid, variantId: z.union([uuid, z.literal("")]), slotId: uuid.optional(), outletId: uuid.optional(), qty: z.number().int().min(1).max(99), nights: z.number().int().min(1).max(30).optional(), priceOverride: z.number().optional(), stayDetails: stayBookingDetailsSchema.optional() }).strict();
const addSchema = z.object({ item: itemSchema }).strict();
const updateQuantitySchema = z.object({ key: z.string().min(1).max(300), quantity: z.number().int().min(0).max(99) }).strict();
const updateStayDetailsSchema = z.object({ cartItemId: uuid, stayDetails: stayBookingDetailsSchema }).strict();
const SELECT = "id,variant_id,slot_id,outlet_id,quantity,nights,unit_price,stay_details,product_variants(product_id),booking_slots(product_id)";

async function cartContext(request: Request, create = false) {
  const guest = await resolveGuestSession(request);
  if (!guest) return null;
  const db = createServiceClient();
  if (create) {
    const { error } = await db.from("carts").upsert({ guest_subject_id: guest.guestSubjectId }, { onConflict: "guest_subject_id", ignoreDuplicates: true });
    if (error) throw new Error("Guest cart unavailable");
  }
  const { data: cart, error } = await db.from("carts").select("id").eq("guest_subject_id", guest.guestSubjectId).maybeSingle();
  if (error) throw new Error("Guest cart unavailable");
  return { db, cartId: cart?.id as string | undefined, guestSubjectId: guest.guestSubjectId };
}
async function rows(ctx: NonNullable<Awaited<ReturnType<typeof cartContext>>>) {
  if (!ctx.cartId) return [];
  const { data, error } = await ctx.db.from("cart_items").select(SELECT).eq("cart_id", ctx.cartId).order("last_added_at", { ascending: false });
  if (error) throw new Error("Guest cart unavailable");
  return data ?? [];
}
function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
export async function GET(request: Request) {
  try {
    const ctx = await cartContext(request);
    return guestPrivateResponse({ items: ctx ? (await rows(ctx)).map((row) => mapCartItem(row as unknown as Parameters<typeof mapCartItem>[0])) : [] });
  } catch { return apiFail("GUEST_CART_UNAVAILABLE", "Unable to load cart", 503); }
}
async function mutate(request: Request, method: "POST" | "PATCH" | "DELETE") {
  if (!isSameOriginMutation(request)) return apiFail("FORBIDDEN", "Use the cart form", 403);
  try {
    const ctx = await cartContext(request, method === "POST");
    if (!ctx?.cartId) return apiFail("GUEST_SESSION_REQUIRED", "Refresh your guest cart", 401);
    if (!await reserveGuestRateLimit(`cart:${ctx.guestSubjectId}`, 120, 900)) return apiFail("RATE_LIMITED", "Try again later", 429);
    const current = await rows(ctx);
    let error: { message?: string } | null = null;
    // Unchanged PATCH values skip the write and the re-read (AGENTS.md: avoid unchanged writes).
    let changed = true;
    if (method === "DELETE") ({ error } = await ctx.db.from("cart_items").delete().eq("cart_id", ctx.cartId));
    else if (method === "PATCH") {
      const body = await readGuestJson(request);
      const stayUpdate = updateStayDetailsSchema.safeParse(body);
      if (stayUpdate.success) {
        const row = current.find((entry) => entry.id === stayUpdate.data.cartItemId);
        if (!row) return apiFail("NOT_FOUND", "Cart item not found", 404);
        const line = mapCartItem(row as unknown as Parameters<typeof mapCartItem>[0]);
        const { data: product } = await ctx.db.from("products").select("id,categories(slug)").eq("id", line.activityId).eq("status", "active").eq("review_status", "approved").maybeSingle();
        if (relation((product as { categories?: { slug: string } | { slug: string }[] | null } | null)?.categories)?.slug !== "accommodation") {
          return apiFail("VALIDATION_FAILED", "Stay details can only be updated for accommodation", 422);
        }
        if (sameStayDetails(line.stayDetails, stayUpdate.data.stayDetails)) changed = false;
        else ({ error } = await ctx.db.from("cart_items").update({ stay_details: stayUpdate.data.stayDetails }).eq("id", row.id).eq("cart_id", ctx.cartId));
      } else {
        const parsed = updateQuantitySchema.safeParse(body);
        if (!parsed.success) return apiFail("VALIDATION_FAILED", "Choose a valid quantity", 422);
        const row = current.find((entry) => cartItemKey(mapCartItem(entry as unknown as Parameters<typeof mapCartItem>[0])) === parsed.data.key);
        if (!row) return apiFail("NOT_FOUND", "Cart item not found", 404);
        if (parsed.data.quantity === Number(row.quantity)) changed = false;
        else ({ error } = parsed.data.quantity === 0
          ? await ctx.db.from("cart_items").delete().eq("id", row.id).eq("cart_id", ctx.cartId)
          : await ctx.db.from("cart_items").update({ quantity: parsed.data.quantity }).eq("id", row.id).eq("cart_id", ctx.cartId));
      }
    } else {
      const parsed = addSchema.safeParse(await readGuestJson(request));
      if (!parsed.success) return apiFail("VALIDATION_FAILED", "Choose a valid item", 422);
      const item = parsed.data.item;
      if (!item.variantId && !item.slotId) return apiFail("VALIDATION_FAILED", "Choose an item option or slot", 422);
      const { data: product } = await ctx.db.from("products").select("id,outlet_id,requires_booking,base_price,categories(slug)").eq("id", item.activityId).eq("status", "active").eq("review_status", "approved").maybeSingle();
      if (!product) return apiFail("NOT_FOUND", "Item unavailable", 404);
      const category = relation((product as { categories?: { slug: string } | { slug: string }[] | null }).categories)?.slug;
      if ((category === "accommodation") !== Boolean(item.stayDetails)) return apiFail("VALIDATION_FAILED", "Accommodation guest details are required before adding this item", 422);
      let authoritativePrice = Number(product.base_price);
      let variantOffset = 0;
      if (item.variantId) {
        const { data } = await ctx.db.from("product_variants").select("id,price_offset").eq("id", item.variantId).eq("product_id", product.id).eq("is_active", true).maybeSingle();
        if (!data) return apiFail("VALIDATION_FAILED", "Option unavailable", 422);
        variantOffset = Number(data.price_offset ?? 0);
      }
      if (item.slotId) {
        const { data } = await ctx.db.from("booking_slots").select("id,outlet_id").eq("id", item.slotId).eq("product_id", product.id).maybeSingle();
        if (!data || data.outlet_id !== (item.outletId ?? product.outlet_id)) return apiFail("VALIDATION_FAILED", "Slot unavailable", 422);
      }
      if (item.nights && item.nights > 1 && !product.requires_booking) return apiFail("VALIDATION_FAILED", "Nights only apply to stays", 422);
      if (product.requires_booking && !item.slotId) return apiFail("VALIDATION_FAILED", "Choose a booking slot", 422);
      if (item.outletId && product.outlet_id !== item.outletId) {
        const { data } = await ctx.db.from("outlet_offers").select("id,price").eq("product_id", product.id).eq("outlet_id", item.outletId).eq("status", "active").maybeSingle();
        if (!data) return apiFail("VALIDATION_FAILED", "Outlet unavailable", 422);
        if (!product.outlet_id) authoritativePrice = Number(data.price);
      }
      const line = { ...item, outletId: item.outletId ?? product.outlet_id ?? undefined };
      const existing = current.find((row) => canMergeCartItemLines(mapCartItem(row as unknown as Parameters<typeof mapCartItem>[0]), line));
      const quantity = existing ? Math.min(99, Number(existing.quantity) + item.qty) : item.qty;
      if (!existing && current.length >= 100) return apiFail("CART_LIMIT", "Your cart is full", 422);
      const values = { variant_id: item.variantId || null, slot_id: item.slotId ?? null, outlet_id: item.outletId ?? product.outlet_id, quantity, nights: item.nights ?? 1, unit_price: authoritativePrice + variantOffset, stay_details: item.stayDetails ?? null, last_added_at: new Date().toISOString() };
      ({ error } = existing ? await ctx.db.from("cart_items").update(values).eq("id", existing.id).eq("cart_id", ctx.cartId) : await ctx.db.from("cart_items").insert({ cart_id: ctx.cartId, ...values }));
    }
    if (error) return apiFail("GUEST_CART_UNAVAILABLE", "Unable to update cart", 503);
    return guestPrivateResponse({ items: (changed ? await rows(ctx) : current).map((row) => mapCartItem(row as unknown as Parameters<typeof mapCartItem>[0])) });
  } catch { return apiFail("GUEST_CART_UNAVAILABLE", "Unable to update cart", 503); }
}
export const POST = (request: Request) => mutate(request, "POST");
export const PATCH = (request: Request) => mutate(request, "PATCH");
export const DELETE = (request: Request) => mutate(request, "DELETE");
