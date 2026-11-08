import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findElements, findOne, installTestDom, TestElement, TestEvent, type TestDocument } from "@/components/shared/__tests__/render-test-dom";
import type { OutletRendererOutlet, OutletRendererProduct } from "@/components/outlet/outlet-block-types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => {
    if (key === "ui.reviews.ratingBucketLabel") return `${options?.rating}★ (${options?.reviewCount})`;
    if (key === "ui.reviews.paginationSummary") return `${options?.pageLabel} · ${options?.reviewCountLabel}`;
    return options?.count !== undefined ? `${key}:${options.count}` : key;
  }, i18n: { language: "en" } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/providers/cart", () => ({ useCart: () => ({ addItem: vi.fn(), selectedKeys: new Set<string>(), setSelectedKeys: vi.fn() }) }));
vi.mock("@/components/providers/app-dialog", () => ({ useAppDialog: () => ({ alert: vi.fn() }) }));
const wishlistMock = vi.hoisted(() => ({ value: null as null | { savedOutletIds: Set<string>; toggleSavedOutlet: () => void } }));
vi.mock("@/components/providers/wishlist", () => ({
  useWishlist: () => {
    if (!wishlistMock.value) throw new Error("useWishlist must be used within WishlistProvider");
    return wishlistMock.value;
  },
  useOptionalWishlist: () => wishlistMock.value,
}));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({ useCustomerCapabilityGate: () => Object.assign(() => true, { handleResponse: vi.fn() }) }));
vi.mock("@/components/providers/reference-currency", () => ({ useReferenceCurrency: () => ({ currency: "MYR", snapshot: null, convert: (v: number) => v }) }));
vi.mock("@/components/customer/stay-guest-details-dialog", () => ({
  StayGuestDetailsDialog: ({ open }: { open: boolean }) => open ? <div data-testid="stay-guest-details-dialog" /> : null,
}));

import { HotelPage } from "../hotel-page";
import { RoomDetailsContent } from "../room-details-dialog";
import { readRoomDetails } from "@/lib/customer/room-details";

const outlet: OutletRendererOutlet = {
  id: "hotel-1",
  name: "Pelangi Beach Resort & Spa",
  address: "Pantai Cenang",
  city: "Langkawi",
  state: "Kedah",
  stay: {
    checkIn: "2026-10-24", checkOut: "2026-10-27", nights: 3, rooms: 1, adults: 2,
    checkInTime: "15:00", checkOutTime: "12:00", policies: "Pets are not permitted.",
    about: "A beachfront resort.", amenities: [{ code: "wifi", label: "Free Wi-Fi", icon: "wifi" }], rating: 4.6, reviews: 12,
  },
};

function room(id: string, attributes: Record<string, unknown>, photos: string[] = []): OutletRendererProduct {
  return {
    id, name: `Room ${id}`, description: "A room.", base_price: 320, cover_url: null, requires_booking: true,
    stay: { total: 960, left: 5, checkInSlotId: `slot-${id}`, details: readRoomDetails(attributes), photos },
  };
}

const full = room("full", { bedType: "1 king bed", maxGuests: 3, sizeSqm: 46.5, view: "Sea view", smoking: "non_smoking", roomAmenities: ["Electronic safe"] }, ["https://example.com/a.jpg"]);
const empty = room("empty", {});

let document: TestDocument;
let createRoot: typeof import("react-dom/client").createRoot;
let container: TestElement;
let root: ReturnType<typeof createRoot>;

beforeAll(async () => {
  document = installTestDom();
  ({ createRoot } = await import("react-dom/client"));
});

beforeEach(() => {
  wishlistMock.value = { savedOutletIds: new Set<string>(), toggleSavedOutlet: vi.fn() };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
});

async function renderHotelPage(nextOutlet: OutletRendererOutlet = outlet, nextRooms: OutletRendererProduct[] = [full]) {
  await act(async () => {
    root.render(<HotelPage outlet={nextOutlet} rooms={nextRooms} gallery={[]} />);
    await Promise.resolve();
  });
}

async function click(element: TestElement) {
  await act(async () => { element.dispatchEvent(new TestEvent("click", { bubbles: true })); });
}

async function changeInput(name: string, value: string) {
  const dateIndex = name === "checkin" ? 0 : 1;
  const input = findElements(container, (element) => element.tagName === "INPUT" && element.type === "date")[dateIndex];
  if (!input) throw new Error(`Expected ${name} date input to be rendered`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(TestElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new TestEvent("input", { bubbles: true }));
    await Promise.resolve();
  });
  return input;
}

function dateInputs() {
  return findElements(container, (element) => element.tagName === "INPUT" && element.type === "date");
}

function bookingButton() {
  return findOne(container, (element) => element.tagName === "BUTTON" &&
    (element.textContent.includes("ui.property.book") || element.textContent.includes("ui.property.soldOut")));
}

describe("hotel page", () => {
  it("renders rooms with Book and never links a room to the product page", () => {
    const markup = renderToStaticMarkup(<HotelPage outlet={outlet} rooms={[full, empty]} gallery={[]} />);
    expect(markup).toContain("Room full");
    expect(markup).toContain("ui.property.book");
    expect(markup).toContain("ui.hotel.roomDetails");
    expect(markup).toContain("Free Wi-Fi");
    expect(markup).toContain("A beachfront resort.");
    expect(markup).toContain("Pets are not permitted.");
    expect(markup).not.toContain("/customer/activity/");
  });

  it("renders without the save button outside the customer wishlist, as in the vendor shop preview", () => {
    wishlistMock.value = null;
    const markup = renderToStaticMarkup(<HotelPage outlet={outlet} rooms={[full]} gallery={[]} />);
    expect(markup).toContain("Room full");
    expect(markup).not.toContain("ui.activity.saveShort");
  });

  it("shows the property's outlet badges and property types", () => {
    const property = {
      ...outlet,
      badgeSlugs: ["hidden_gem", "family_friendly"],
      accommodationTypeSlugs: ["boutique", "resort"],
    };
    const markup = renderToStaticMarkup(<HotelPage outlet={property} rooms={[]} gallery={[]} />);

    expect(markup).toContain("ui.labels.hiddenGem");
    expect(markup).toContain("strictMigration.activityDetail.familyFriendly");
    expect(markup).toContain("strictMigration.activityDetail.types.boutique");
    expect(markup).toContain("strictMigration.activityDetail.types.resort");
  });

  it("lists a room's bed, size and amenities in the popup content", () => {
    const markup = renderToStaticMarkup(<RoomDetailsContent room={full} />);
    expect(markup).toContain("1 king bed");
    expect(markup).toContain("46.5");
    expect(markup).toContain("Sea view");
    expect(markup).toContain("Electronic safe");
    expect(markup).toContain("https://example.com/a.jpg");
  });

  it("renders a room with no details and no photos without empty rows", () => {
    const markup = renderToStaticMarkup(<><HotelPage outlet={outlet} rooms={[empty]} gallery={[]} /><RoomDetailsContent room={empty} /></>);
    expect(markup).not.toContain("undefined");
    expect(markup).not.toContain("ui.hotel.bed");
    expect(markup).not.toContain("ui.hotel.size");
    expect(markup).toContain("A room.");
  });

  it("is the public template for hotels while other outlets keep their blocks and menu", () => {
    const renderer = readFileSync(resolve(process.cwd(), "components/outlet/outlet-page-renderer.tsx"), "utf8");
    expect(renderer).toContain("<HotelPage");
    expect(renderer).not.toContain("StaySection");
    expect(renderer).toContain("<OutletMenu outlet={outlet} products={products} canUseCustomerActions={canUseCustomerActions} />");
  });

  it("formats prices with ReferencePrice, never inside a translation string", () => {
    const source = readFileSync(resolve(process.cwd(), "components/outlet/hotel-page.tsx"), "utf8");
    expect(source).toContain("<ReferencePrice");
    expect(source).not.toContain("ui.property.totalFor");
    expect(source).not.toContain("ui.outletMenu.price");
    expect(source).not.toMatch(/<(button|input)\b/);
  });

  it("renders the complete hotel search bar and real guest reviews", () => {
    const markup = renderToStaticMarkup(<HotelPage
      outlet={outlet}
      rooms={[full]}
      gallery={[]}
      reviewTotal={8}
      reviewRatingBuckets={[{ rating: 5, count: 4 }, { rating: 4, count: 4 }]}
      reviews={[{
        id: "review-1",
        rating: 5,
        title: "A lovely stay",
        body: "The room was quiet and the staff were kind.",
        createdAt: "2026-09-12T10:00:00.000Z",
        authorName: "Aisyah R.",
        verifiedPurchase: true,
        productId: "room-1",
        productName: "Garden Family Room",
        outletId: "hotel-1",
        outletName: "Pelangi Beach Resort & Spa",
      }]}
    />);

    expect(markup).toContain("name=\"checkin\"");
    expect(markup).toContain("name=\"checkout\"");
    expect(markup).toContain("name=\"rooms\"");
    expect(markup).toContain("name=\"adults\"");
    expect(markup).toContain("method=\"get\"");
    expect(markup).toContain("ui.hotel.checkAvailability");
    expect(markup).not.toContain("ui.property.search");
    expect(markup).not.toContain("A lovely stay");
    expect(markup).toContain("The room was quiet and the staff were kind.");
    expect(markup).toContain("ui.reviews.verifiedPurchase");
    expect(markup).toContain("Garden Family Room");
    expect(markup).toContain("ui.reviews.allRatings (8)");
    expect(markup).toContain("5★ (4)");
  });

  it("captures guest details before adding and does not redirect directly to checkout", () => {
    const source = readFileSync(resolve(process.cwd(), "components/outlet/hotel-page.tsx"), "utf8");
    expect(source).toContain("StayGuestDetailsDialog");
    expect(source).toContain("setGuestDialogOpen(true)");
    expect(source).toContain("await alert(t(\"ui.property.stayAdded\"))");
    expect(source).not.toContain("router.push(`/customer/checkout");
  });
});

describe("hotel page header", () => {
  it("names the hotel in the main heading with its rating and address", () => {
    const markup = renderToStaticMarkup(<HotelPage outlet={outlet} rooms={[empty]} gallery={[]} />);
    expect(markup).toMatch(/<h1[^>]*>Pelangi Beach Resort &amp; Spa<\/h1>/);
    expect(markup).toContain("4.6");
    expect(markup).toContain("Pantai Cenang");
  });

  it("hides the rating when the hotel has no reviews yet", () => {
    const markup = renderToStaticMarkup(<HotelPage outlet={{ ...outlet, stay: { ...outlet.stay!, rating: 0, reviews: 0 } }} rooms={[empty]} gallery={[]} />);
    expect(markup).not.toContain("ui.hotel.reviewCount");
  });
});

describe("hotel search interactions", () => {
  it("updates the displayed night count immediately when dates change", async () => {
    await renderHotelPage();
    expect(container.textContent).toContain("ui.property.nightsSummary:3");

    await changeInput("checkout", "2026-10-29");

    expect(container.textContent).toContain("ui.property.nightsSummary:5");
    expect(dateInputs()[1].getAttribute("min")).toBe("2026-10-25");
  });

  it("blocks a same-day check-out instead of submitting invalid dates", async () => {
    await renderHotelPage();
    await changeInput("checkout", "2026-10-24");

    expect(container.textContent).toContain("ui.hotel.invalidDateRange");
    const submit = findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("ui.hotel.checkAvailability"));
    expect(submit.disabled).toBe(true);
    const form = findOne(container, (element) => element.tagName === "FORM");
    const event = new TestEvent("submit", { bubbles: true });
    await act(async () => { form.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
  });

  it("blocks stays longer than the server-supported 30-night limit", async () => {
    await renderHotelPage();
    const checkout = await changeInput("checkout", "2026-11-24");

    expect(checkout.getAttribute("max")).toBe("2026-11-23");
    expect(container.textContent).toContain("ui.hotel.stayExceedsNightLimit");
    const submit = findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("ui.hotel.checkAvailability"));
    expect(submit.disabled).toBe(true);
    const form = findOne(container, (element) => element.tagName === "FORM");
    const event = new TestEvent("submit", { bubbles: true });
    await act(async () => { form.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(bookingButton().disabled).toBe(true);
  });

  it("shows the minimum room count and only applies it to the search fields", async () => {
    await renderHotelPage();
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label") === "ui.hotel.moreAdults"));
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label") === "ui.hotel.moreAdults"));

    expect(container.textContent).toContain("ui.hotel.minimumRoomsForAdults");
    expect(bookingButton().disabled).toBe(true);
    await click(findOne(container, (element) => element.tagName === "BUTTON" && element.textContent.includes("ui.hotel.setMinimumRooms:2")));

    expect(container.textContent).toContain("ui.property.roomsCount:2");
    expect(container.textContent).toContain("ui.hotel.availabilityNeedsRefresh");
    expect(bookingButton().disabled).toBe(true);
  });

  it("does not allow booking from stale results and enables booking after refreshed availability arrives", async () => {
    await renderHotelPage();
    await changeInput("checkout", "2026-10-28");

    expect(container.textContent).toContain("ui.hotel.availabilityNeedsRefresh");
    expect(bookingButton().disabled).toBe(true);
    await click(bookingButton());
    expect(findElements(container, (element) => element.getAttribute("data-testid") === "stay-guest-details-dialog")).toHaveLength(0);

    await renderHotelPage({ ...outlet, stay: { ...outlet.stay!, checkOut: "2026-10-28", nights: 4 } });
    expect(container.textContent).not.toContain("ui.hotel.availabilityNeedsRefresh");
    expect(bookingButton().disabled).toBe(false);
  });

  it("does not block booking when a room type has no known adult capacity", async () => {
    await renderHotelPage(outlet, [empty]);

    expect(container.textContent).not.toContain("ui.hotel.minimumRoomsForAdults");
    expect(bookingButton().disabled).toBe(false);
  });

  it("keeps the room unavailable when server stock is below the selected room count", async () => {
    const twoRooms = { ...outlet, stay: { ...outlet.stay!, rooms: 2 } };
    const lowStock = { ...full, stay: { ...full.stay!, left: 1 } };
    await renderHotelPage(twoRooms, [lowStock]);

    expect(bookingButton().disabled).toBe(true);
  });

  it("explains and blocks a room type that would need more than the ten-room search limit", async () => {
    const twentyAdults = { ...outlet, stay: { ...outlet.stay!, adults: 20, rooms: 1 } };
    const oneAdultPerRoom = room("single", { maxGuests: 1 });
    await renderHotelPage(twentyAdults, [oneAdultPerRoom]);

    expect(container.textContent).toContain("ui.hotel.exceedsRoomLimit:20");
    expect(bookingButton().disabled).toBe(true);
  });
});
