import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Event vendors (vendors.kind = 'event') own their vendor row, so the
// ownership check in authorizeVendor would let them into every vendor route.
// authorizeVendor therefore rejects them unless a route opts in with
// { allowEventVendor: true }. This contract makes every opt-in deliberate.

/** Routes an event vendor needs: event registration, pickup, scan history, invitations, notifications. */
const EVENT_VENDOR_ALLOWED = [
  "app/api/notifications/read-all/route.ts",
  "app/api/notifications/route.ts",
  "app/api/vendors/[vendorId]/announcements/[id]/read/route.ts",
  "app/api/vendors/[vendorId]/announcements/read/route.ts",
  "app/api/vendors/[vendorId]/announcements/route.ts",
  "app/api/vendors/[vendorId]/campaign-listings/[listingId]/route.ts",
  "app/api/vendors/[vendorId]/campaign-registrations/[id]/route.ts",
  "app/api/vendors/[vendorId]/campaign-registrations/[id]/withdraw/route.ts",
  "app/api/vendors/[vendorId]/campaign-registrations/route.ts",
  "app/api/vendors/[vendorId]/event-orders/route.ts",
  "app/api/vendors/[vendorId]/event-promotions/upload/route.ts",
  "app/api/vendors/[vendorId]/event-staff/[campaignId]/members/[memberId]/route.ts",
  "app/api/vendors/[vendorId]/event-staff/[campaignId]/route.ts",
  "app/api/vendors/[vendorId]/pickup-slots/[slotId]/route.ts",
  "app/api/vendors/[vendorId]/pickup-slots/route.ts",
  "app/api/vendors/[vendorId]/redemptions/route.ts",
  "app/api/vendors/[vendorId]/scanner/fulfil-event-pickup/route.ts",
  "app/api/vendors/[vendorId]/scanner/resolve/route.ts",
];

/**
 * Vendor routes that do not go through authorizeVendor, with why an event
 * vendor reaching them is safe. New routes here need a reviewed reason.
 */
const NOT_AUTHORIZE_VENDOR = {
  "app/api/vendor/claim/route.ts": "claims an invite; picks the claim RPC from the invite's kind on the server",
  "app/api/vendor/revenue-assistant/route.ts": "read-only, scoped to the caller's own vendor",
  "app/api/vendor/settlements/route.ts": "the event vendor's own wallet settlements",
  "app/api/vendor/share-analytics/route.ts": "read-only, scoped to the caller's own vendor",
  "app/api/vendors/[vendorId]/outlets/[outletId]/calendar.ics/route.ts": "outlet feed; event vendors have no outlets (DB trigger)",
  "app/api/vendors/[vendorId]/reviews/route.ts": "public read-only: visible reviews and rating counts for an approved vendor page; no writes or private data",
  "app/api/vendors/route.ts": "registers a shop vendor; one vendor per owner is enforced by the RPC",
} as const;

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

function routeFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") files.push(...routeFiles(path));
    } else if (entry.name === "route.ts") {
      files.push(path);
    }
  }
  return files;
}

const apiRoutes = routeFiles("app/api");
const callsAuthorize = (source: string) => /\bauthorize(?:Vendor|Outlet)(?:ProductWrite)?\(/.test(source);

describe("event vendor API access contract", () => {
  it("opts in exactly the allowlisted routes", () => {
    const optedIn = apiRoutes.filter((file) => read(file).includes("allowEventVendor: true")).sort();
    expect(optedIn).toEqual([...EVENT_VENDOR_ALLOWED].sort());
  });

  it("keeps every allowlisted route behind authorizeVendor", () => {
    for (const file of EVENT_VENDOR_ALLOWED) {
      expect(callsAuthorize(read(file)), file).toBe(true);
    }
  });

  it("classifies every vendor route", () => {
    const vendorRoutes = apiRoutes.filter((file) => file.startsWith("app/api/vendors/") || file.startsWith("app/api/vendor/"));
    const unclassified = vendorRoutes.filter((file) => !callsAuthorize(read(file)) && !(file in NOT_AUTHORIZE_VENDOR));
    expect(unclassified).toEqual([]);
    for (const file of Object.keys(NOT_AUTHORIZE_VENDOR)) {
      expect(vendorRoutes, file).toContain(file);
    }
  });

  it("rejects event vendors in authorizeVendor unless the route opts in", () => {
    const source = read("lib/vendor-authorization.ts");
    expect(source).toMatch(/\.select\('id,owner_id,status,kind'\)/);
    expect(source).toMatch(/vendor\?\.kind === 'event' && !options\.allowEventVendor/);
    expect(source).toMatch(/scopedVendor\?\.kind === 'event' && !options\.allowEventVendor/);
  });
});
