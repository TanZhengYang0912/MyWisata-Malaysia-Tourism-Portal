import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PLACEMENT_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { POST } from "../route";

function request(body: unknown) {
  return new Request(`https://mywisata.test/api/sponsored-placements/${PLACEMENT_ID}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("public sponsored placement event route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: "44444444-4444-4444-8444-444444444444", error: null });
  });

  it("records only the strict placement/product/event tuple through the validating RPC", async () => {
    const response = await POST(request({ eventType: "impression", productId: PRODUCT_ID }), {
      params: Promise.resolve({ id: PLACEMENT_ID }),
    });

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("record_sponsored_discovery_event", {
      p_placement_id: PLACEMENT_ID,
      p_product_id: PRODUCT_ID,
      p_event_type: "impression",
    });
  });

  it("rejects arbitrary metadata without touching the database", async () => {
    const response = await POST(request({
      eventType: "click",
      productId: PRODUCT_ID,
      metadata: { ip: "203.0.113.1", fingerprint: "browser-id" },
    }), { params: Promise.resolve({ id: PLACEMENT_ID }) });

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    "sponsored_placement_not_effective",
    "sponsored_placement_product_mismatch",
    "sponsored_product_not_eligible",
  ])("rejects server-side eligibility failure %s", async (databaseError) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: databaseError } });

    const response = await POST(request({ eventType: "click", productId: PRODUCT_ID }), {
      params: Promise.resolve({ id: PLACEMENT_ID }),
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("SPONSORED_EVENT_INELIGIBLE");
  });

  it("wires server-derived ranking, deduplicated impressions and pre-navigation clicks without a service client", () => {
    const root = process.cwd();
    const explore = readFileSync(resolve(root, "app/customer/explore/explore-client.tsx"), "utf8");
    const route = readFileSync(resolve(root, "app/api/sponsored-placements/[id]/events/route.ts"), "utf8");
    expect(explore).toContain("rankDiscoveryResults");
    expect(explore).toContain('.rpc("list_active_sponsored_discovery_placements")');
    expect(explore).not.toContain('.from("sponsored_discovery_placements")');
    expect(explore).toContain("impressedPlacementIds.current.has(placementId)");
    expect(explore).toContain('recordSponsoredEvent(activity, "impression")');
    expect(explore).toContain('recordSponsoredEvent(a, "click")');
    expect(route).not.toContain("createServiceClient");
    expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("conditionally labels cards and every StoryMap result in all customer locales", () => {
    const root = process.cwd();
    const card = readFileSync(resolve(root, "components/customer/activity-card.tsx"), "utf8");
    const map = readFileSync(resolve(root, "components/demo-map/story-map.tsx"), "utf8");
    expect(card).toContain("activity.sponsorship &&");
    expect(card).toContain('t("ui.labels.sponsored")');
    expect(card).not.toContain('activity.sponsorship?.label ?? t("ui.labels.sponsored")');
    expect(map.match(/\.sponsorship &&/g)?.length).toBeGreaterThanOrEqual(3);
    expect(map.match(/t\("ui\.labels\.sponsored"\)/g)?.length).toBeGreaterThanOrEqual(3);

    for (const [locale, expected] of [["en", "Sponsored"], ["ms", "Ditaja"], ["zh-CN", "赞助"]] as const) {
      const messages = JSON.parse(readFileSync(resolve(root, `app/i18n/locales/${locale}/customer.json`), "utf8"));
      expect(messages.ui.labels.sponsored).toBe(expected);
    }
  });
});
