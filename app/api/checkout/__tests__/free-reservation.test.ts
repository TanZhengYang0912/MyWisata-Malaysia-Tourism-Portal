import { describe, expect, it, vi } from "vitest";
import { POST } from "../prepare/route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/auth/customer-capabilities.server", () => ({
  resolveServerCustomerCapability: vi.fn(),
  customerCapabilityFailure: vi.fn(),
}));

vi.mock("@/lib/cache/catalogue-cache", () => ({
  getCachedActivities: vi.fn(),
}));

vi.mock("@/backend/domains/catalogue", () => ({
  getActivities: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
}));

import { createClient } from "@/lib/supabase/server";
import { resolveServerCustomerCapability, customerCapabilityFailure } from "@/lib/auth/customer-capabilities.server";
import { getActivities } from "@/backend/domains/catalogue";
import { getCachedActivities } from "@/lib/cache/catalogue-cache";
import { stripe } from "@/lib/stripe";

describe("POST /api/checkout/prepare (Free Activity Reservations)", () => {
  const userId = "user-free-101";
  const cartId = "cart-free-202";
  const activityId = "act-free-303";
  const slotId = "slot-free-404";
  const variantId = "var-free-505";
  const outletId = "out-free-606";
  const vendorId = "ven-free-707";

  function setupMocks() {
    vi.mocked(resolveServerCustomerCapability).mockResolvedValue({
      allowed: true,
      blockerCode: null,
      currentTier: "phone_verified",
      requiredTier: "phone_verified",
      nextAction: "none",
    });
    vi.mocked(customerCapabilityFailure).mockReturnValue(null);

    const mockCartSingle = vi.fn().mockResolvedValue({ data: { id: cartId }, error: null });
    const mockCartItems = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "ci-1",
            variant_id: variantId,
            slot_id: slotId,
            outlet_id: outletId,
            quantity: 1,
            product_variants: { id: variantId, product_id: activityId, name: "Standard" },
            booking_slots: { id: slotId, product_id: activityId, outlet_id: outletId, starts_at: "2026-09-10T10:00:00Z", price_override: 0 },
          },
        ],
        error: null,
      }),
    });

    const mockProducts = vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({
        data: [
          {
            id: activityId,
            outlet_id: outletId,
            vendor_id: vendorId,
            name: "Merdeka Square Heritage Walk",
            cover_url: "https://example.com/walk.jpg",
            base_price: 0,
            requires_booking: true,
          },
        ],
        error: null,
      }),
    });

    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        checkout_session_id: "cs-free-1",
        order_id: "order-free-1",
        payment_id: "pay-free-1",
        status: "paid",
      },
      error: null,
    });

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
      },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "carts") {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: mockCartSingle }) }) };
        }
        if (table === "cart_items") {
          return { select: vi.fn().mockReturnValue({ eq: mockCartItems }) };
        }
        if (table === "products") {
          return { select: mockProducts };
        }
        return { select: vi.fn() };
      }),
      rpc: mockRpc,
    } as any);

    const activitiesData = [
      {
        id: activityId,
        outletId,
        name: "Merdeka Square Heritage Walk",
        category: "cultural",
        description: "Free guided walking tour",
        image: "https://example.com/walk.jpg",
        price: 0,
        rating: 5,
        reviews: 10,
        duration: "2 hours",
        meetingPoint: "Merdeka Square",
        requiresBooking: true,
        variants: [{ id: variantId, label: "Standard", price: 0 }],
      } as any,
    ];
    vi.mocked(getActivities).mockResolvedValue(activitiesData);
    vi.mocked(getCachedActivities).mockResolvedValue(activitiesData);

    return { mockRpc };
  }

  it("reserves free slot without payment gateway calls and returns paid order status", async () => {
    const { mockRpc } = setupMocks();

    const req = new Request("http://localhost:3000/api/checkout/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethod: "free_reservation",
        idempotencyKey: "12345678-1234-1234-1234-1234567890ab",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.data.order_id).toBe("order-free-1");
    expect(json.data.total).toBe(0);
    expect(json.data.status).toBe("paid");

    // Verified: No Stripe checkout session was created
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();

    // Verified: Database RPC received free_reservation payment method and zero total
    expect(mockRpc).toHaveBeenCalledWith("prepare_checkout", expect.objectContaining({
      p_payment_method: "free_reservation",
      p_total: 0,
      p_subtotal: 0,
    }));
  });

  it("rejects non-phone-verified customers from reserving free slots", async () => {
    setupMocks();
    vi.mocked(customerCapabilityFailure).mockReturnValue(
      Response.json({ error: { code: "PHONE_REQUIRED", message: "Phone verification required" } }, { status: 403 }) as any,
    );

    const req = new Request("http://localhost:3000/api/checkout/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethod: "free_reservation",
        idempotencyKey: "12345678-1234-1234-1234-1234567890ab",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("PHONE_REQUIRED");
  });
});
