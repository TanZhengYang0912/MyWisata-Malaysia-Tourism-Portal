import { beforeEach, describe, expect, it, vi } from "vitest";

type TableResult = { data: unknown; error: unknown };

const mocks = vi.hoisted(() => ({
  tables: {} as Record<string, TableResult>,
  getCachedComputedActivities: vi.fn(),
  getComputedActivity: vi.fn(),
}));

// Each table query resolves to the result configured for that table.
function tableQuery(table: string) {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    then: (resolve: (value: TableResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(mocks.tables[table] ?? { data: [], error: null }).then(resolve, reject),
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: tableQuery }) }));
vi.mock("@/lib/auth/claims-user", () => ({ getClaimsUserId: async () => "user-1" }));
vi.mock("@/lib/i18n/server", () => ({ getServerTranslation: async () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/cache/catalogue-cache", () => ({ getCachedComputedActivities: mocks.getCachedComputedActivities }));
vi.mock("@/backend/domains/catalogue", () => ({ getComputedActivity: mocks.getComputedActivity }));
vi.mock("@/components/shared/empty-state", () => ({ EmptyState: () => null }));
vi.mock("../../wishlist/wishlist-client", () => ({ SavedHubClient: () => null }));

const { default: SavedPage } = await import("../page");

function activity(id: string, outletId: string, categorySlug = "activity") {
  return { id, categorySlug, outlet: { id: outletId } };
}

const CATALOGUE = [
  activity("product-a", "outlet-1"),
  activity("product-b", "outlet-1"),
  activity("product-c", "outlet-2"),
  activity("room-1", "hotel-1", "accommodation"),
  activity("room-2", "hotel-2", "accommodation"),
];

async function render() {
  return (await SavedPage()) as { props: Record<string, unknown> };
}

describe("saved page reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tables = {};
    mocks.getCachedComputedActivities.mockResolvedValue(CATALOGUE);
  });

  it("builds saved product cards from the shared catalogue in wishlist order, without per-product reads", async () => {
    mocks.tables.customer_wishlists = {
      data: [{ product_id: "product-c" }, { product_id: "product-gone" }, { product_id: "product-a" }],
      error: null,
    };
    const { props } = await render();
    expect((props.activities as { id: string }[]).map((item) => item.id)).toEqual(["product-c", "product-a"]);
    expect(mocks.getComputedActivity).not.toHaveBeenCalled();
    expect(mocks.getCachedComputedActivities).toHaveBeenCalledTimes(1);
  });

  it("reads the catalogue once for saved products and saved hotels together", async () => {
    mocks.tables.customer_wishlists = { data: [{ product_id: "product-b" }], error: null };
    mocks.tables.customer_saved_outlets = { data: [{ outlet_id: "hotel-2" }], error: null };
    const { props } = await render();
    expect((props.activities as { id: string }[]).map((item) => item.id)).toEqual(["product-b"]);
    expect((props.hotelRooms as { id: string }[]).map((item) => item.id)).toEqual(["room-2"]);
    expect(mocks.getCachedComputedActivities).toHaveBeenCalledTimes(1);
  });

  it("skips the catalogue when nothing is saved", async () => {
    const { props } = await render();
    expect(props.activities).toEqual([]);
    expect(props.hotelRooms).toEqual([]);
    expect(mocks.getCachedComputedActivities).not.toHaveBeenCalled();
  });

  it("keeps the unavailable state for a failed wishlist read and skips the catalogue", async () => {
    mocks.tables.customer_wishlists = { data: null, error: { message: "offline" } };
    const { props } = await render();
    expect(props.title).toBe("ui.wishlist.unavailable");
    expect(mocks.getCachedComputedActivities).not.toHaveBeenCalled();
  });
});
