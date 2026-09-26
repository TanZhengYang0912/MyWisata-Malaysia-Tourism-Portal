import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { POST } from "../[provider]/route";

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from "@/lib/supabase/service";

describe("POST /api/integrations/webhooks/[provider]", () => {
  const secret = "super_secret_webhook_key";
  const sourceIdentifier = "klook_channel_101";
  const slotId = "11111111-2222-3333-4444-555555555555";

  function createSignedRequest(provider: string, bodyObj: unknown, signWithSecret = secret) {
    const rawBody = JSON.stringify(bodyObj);
    const signature = createHmac("sha256", signWithSecret).update(rawBody, "utf8").digest("hex");

    return new Request(`http://localhost:3000/api/integrations/webhooks/${provider}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mywisata-signature": `sha256=${signature}`,
      },
      body: rawBody,
    });
  }

  it("rejects unsupported providers", async () => {
    const req = new Request("http://localhost:3000/api/integrations/webhooks/unsupported_service", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req, { params: Promise.resolve({ provider: "unsupported_service" }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_PROVIDER");
  });

  it("rejects unauthorized requests with invalid signature", async () => {
    const body = {
      sourceIdentifier,
      externalBookingId: "ext-1",
      slotId,
      quantity: 2,
    };

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "src-1",
              webhook_secret: secret,
              sync_enabled: true,
            },
            error: null,
          }),
        }),
      }),
    });

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as any);

    // Sign with wrong secret
    const req = createSignedRequest("klook", body, "wrong_secret");
    const res = await POST(req, { params: Promise.resolve({ provider: "klook" }) });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it("authenticates the raw body before rejecting malformed event semantics", async () => {
    const body = {
      sourceIdentifier,
      externalBookingId: "ext-invalid-action",
      slotId,
      quantity: 1,
      action: "refund",
    };
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: "src-1", webhook_secret: secret, sync_enabled: true },
            error: null,
          }),
        }),
      }),
    });
    const mockRpc = vi.fn();
    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
      rpc: mockRpc,
    } as any);

    const response = await POST(createSignedRequest("klook", body), { params: Promise.resolve({ provider: "klook" }) });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects oversized unsigned bodies before source lookup", async () => {
    vi.mocked(createServiceClient).mockClear();
    const request = new Request("http://localhost:3000/api/integrations/webhooks/klook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": "70000" },
      body: "{}",
    });

    const response = await POST(request, { params: Promise.resolve({ provider: "klook" }) });

    expect(response.status).toBe(413);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it("successfully confirms booking and respects database capacity", async () => {
    const body = {
      sourceIdentifier,
      externalBookingId: "ext-2",
      slotId,
      quantity: 2,
      guestName: "John Doe",
    };

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "src-1",
              webhook_secret: secret,
              sync_enabled: true,
            },
            error: null,
          }),
        }),
      }),
    });

    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        success: true,
        action: "confirmed",
        reservation_id: "res-101",
        slot_id: slotId,
        booked: 5,
        capacity: 10,
      },
      error: null,
    });

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
      rpc: mockRpc,
    } as any);

    const req = createSignedRequest("klook", body);
    const res = await POST(req, { params: Promise.resolve({ provider: "klook" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.success).toBe(true);
    expect(json.data.action).toBe("confirmed");
    expect(mockRpc).toHaveBeenCalledWith("apply_external_reservation", expect.objectContaining({
      p_external_booking_id: "ext-2",
      p_quantity: 2,
    }));
  });

  it("enforces database capacity authority and returns 409 on overbooking attempt", async () => {
    const body = {
      sourceIdentifier,
      externalBookingId: "ext-3",
      slotId,
      quantity: 5,
    };

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: "src-1",
              webhook_secret: secret,
              sync_enabled: true,
            },
            error: null,
          }),
        }),
      }),
    });

    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        success: false,
        conflict: "overbooked",
        reservation_id: "res-conflict-99",
        capacity: 10,
        booked: 8,
        requested: 5,
      },
      error: null,
    });

    vi.mocked(createServiceClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
      rpc: mockRpc,
    } as any);

    const req = createSignedRequest("klook", body);
    const res = await POST(req, { params: Promise.resolve({ provider: "klook" }) });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CAPACITY_EXCEEDED");
    expect(json.error.details.conflict).toBe("overbooked");
  });
});
