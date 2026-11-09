import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ outletRows: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      const data = table === "outlets" ? mocks.outletRows : [];
      const query: {
        select: (columns: string) => typeof query;
        eq: (column: string, value: unknown) => typeof query;
        limit: (count: number) => Promise<{ data: Array<Record<string, unknown>>; error: null }>;
      } = {
        select: () => query,
        eq: () => query,
        limit: async () => ({ data, error: null }),
      };
      return query;
    },
  })),
}));
vi.mock("@/backend/domains/places", () => ({ getPlaceBySlug: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn(() => ({})) }));
vi.mock("@/backend/domains/vendor-reviews", () => ({ getScopeRatingSummaries: vi.fn(async () => new Map()) }));
vi.mock("@/lib/i18n/server", () => ({ getServerTranslation: vi.fn(async () => ({ t: (key: string) => key })) }));

import DestinationPage from "@/app/customer/destination/[destinationId]/page";

describe("destination outlet card routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.outletRows = [{
      id: "outlet-123",
      name: "Test Outlet",
      address: "1 Test Street",
      city: "George Town",
      state: "Penang",
      vendors: { id: "vendor-456", name: "Test Vendor", logo_url: null, status: "approved" },
    }];
  });

  it("opens the outlet page, not its vendor page, when the outlet has a vendor", async () => {
    const markup = renderToStaticMarkup(await DestinationPage({ params: Promise.resolve({ destinationId: "penang" }) }));

    expect(markup).toContain('href="/customer/outlets/outlet-123"');
    expect(markup).not.toContain('href="/customer/vendors/vendor-456"');
  });
});
