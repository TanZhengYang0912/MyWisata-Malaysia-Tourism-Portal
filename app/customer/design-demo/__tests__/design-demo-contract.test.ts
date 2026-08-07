import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const customerPageSource = read("app/customer/page.tsx");
const pageSource = read("app/customer/design-demo/page.tsx");
const clientSource = read("app/customer/design-demo/design-demo-client.tsx");

describe("customer home design demo contract", () => {
  it("promotes the design demo as the production customer home", () => {
    expect(customerPageSource).toContain('from "./design-demo/page"');
    expect(customerPageSource).not.toContain("HomeClient");
    expect(pageSource).toContain("DesignDemoClient");
    expect(pageSource).not.toContain("HomeClient");
    expect(clientSource).not.toContain("from \"../home-client\"");
  });

  it("contains the approved atlas discovery language", () => {
    expect(clientSource).toContain("Find the place that");
    expect(clientSource).toContain("Where should we wander?");
    expect(clientSource).toContain("/customer/explore");
    expect(clientSource).toContain("Discover your next region.");
    expect(clientSource).toContain("View all vendors");
  });

  it("keeps the demo data-backed and dependency-free", () => {
    expect(pageSource).toContain('searchActivities({ state: "All Malaysia", category: null }, db)');
    expect(pageSource).toContain("getRecommendedFeed");
    expect(pageSource).toContain('from("vendors")');
    expect(clientSource).toContain("MALAYSIA_DESTINATIONS");
    expect(clientSource).not.toContain("https://");
  });

  it("defines a purposeful motion system with reduced-motion support", () => {
    expect(clientSource).toContain("IntersectionObserver");
    expect(clientSource).toContain("--atlas-ease-out");
    expect(clientSource).toContain("atlas-card-in");
    expect(clientSource).toContain("atlas-sheen");
    expect(clientSource).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps planning vendor-first and hands package purchase to the existing detail flow", () => {
    for (const label of ["City guide", "Transport & transfers", "Weekend escape", "Local host"]) {
      expect(clientSource).toContain(`label: "${label}"`);
    }
    expect(clientSource).toContain("Plan with a local partner");
    expect(clientSource).toContain("Explore a package");
    expect(clientSource).toContain("Open the package to choose its outlet, time or option before checkout.");
    expect(clientSource).toContain("Save this feeling");
    expect(clientSource).toContain("aria-pressed");
  });

  it("shows vendors before outlets and experiences", () => {
    expect(clientSource).toContain("Featured local partners");
    expect(clientSource).not.toContain("Top picks for you");
    expect(clientSource).not.toContain("Tune my preferences");
    expect(clientSource).toContain("DemoVendorCard");
    expect(clientSource).toContain("Verified vendor");
    expect(clientSource).toContain("Explore vendor");
    expect(clientSource).toContain('href={`/customer/vendor/${vendor.id}`}');
    expect(clientSource).toContain("xl:grid-cols-4");
    expect(clientSource).not.toContain("Open experience");
  });

  it("does not use destination photography as a vendor fallback", () => {
    expect(clientSource).toContain("getVendorVisual");
    expect(clientSource).toContain("visual.logoUrl");
    expect(clientSource).not.toContain("fallbackDestination.image");
    expect(clientSource).not.toContain("const image = vendor.coverUrl ??");
  });

  it("keeps the hero legible at tablet widths", () => {
    expect(clientSource).toContain("md:grid-cols-[minmax(0,1fr)_minmax(300px,0.82fr)]");
    expect(clientSource).toContain("md:min-h-[500px]");
    expect(clientSource).toContain("lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]");
  });

  it("keeps the first viewport blue and makes destinations a light 3D carousel", () => {
    expect(clientSource).toContain("min-h-[calc(100svh-64px)]");
    expect(clientSource).toContain("Choose your next destination");
    expect(clientSource).toContain("Swipe or use arrows");
    expect(clientSource).toContain("destinationRailStart");
    expect(clientSource).toContain("atlas-rail-page");
    expect(clientSource).toContain("rotateY");
    expect(clientSource).toContain("aria-label=\"Destination carousel\"");
  });

  it("uses the shared blue customer theme instead of a page-specific green palette", () => {
    expect(clientSource).toContain('className="atlas-theme overflow-hidden bg-background text-foreground"');
    expect(clientSource).toContain("bg-primary");
    expect(clientSource).toContain("bg-secondary");
    expect(clientSource).toContain("text-primary");
    expect(clientSource).not.toContain("#0c6b6d");
    expect(clientSource).not.toContain("#dcebea");
    expect(clientSource).not.toContain("#f1eadc");
  });

  it("keeps destination rail pagination independent from the hero spotlight", () => {
    const moveDestinationRail = clientSource.match(/function moveDestinationRail[\s\S]*?\n  }\n\n  return/)?.[0] ?? "";

    expect(clientSource).toContain("setDestinationRailPage(nextPage)");
    expect(moveDestinationRail).not.toContain("setDestinationRailSelection");
    expect(moveDestinationRail).not.toContain("setActiveState");
  });

  it("keeps destination rail card clicks local without navigation", () => {
    expect(clientSource).toContain("const [destinationRailSelection, setDestinationRailSelection]");
    expect(clientSource).toContain("setDestinationRailSelection(destination.state); setActiveState(destination.state)");
    expect(clientSource).toContain("aria-pressed={isRailSelected}");
    expect(clientSource).not.toContain("href={`/customer?state=${encodeURIComponent(destination.state)}`} aria-current");
  });

  it("shows the visible destination range with a 16-state progress rail", () => {
    expect(clientSource).toContain("const destinationRailEnd = Math.min(destinationRailStart + DESTINATION_RAIL_SIZE, MALAYSIA_DESTINATIONS.length)");
    expect(clientSource).toContain("Showing destinations ${destinationRailStart + 1} to ${destinationRailEnd} of ${MALAYSIA_DESTINATIONS.length}");
    expect(clientSource).toContain("index >= destinationRailStart && index < destinationRailEnd");
    expect(clientSource).toContain("01");
  });

  it("uses separate postcard stages so narrow controls cannot overlap", () => {
    expect(clientSource).toContain("atlas-mobile-note");
    expect(clientSource).toContain("atlas-mobile-spotlight");
    expect(clientSource).toContain("atlas-desktop-spotlight");
    expect(clientSource).toContain("lg:hidden");
    expect(clientSource).toMatch(/atlas-depth-card[^"\n]*hidden[^"\n]*lg:block/);
    expect(clientSource).toMatch(/atlas-active-card[^"\n]*w-full[^"\n]*lg:w-\[82%\]/);
  });

  it("paginates the complete destination set", () => {
    expect(clientSource).toContain("DESTINATIONS_PER_PAGE");
    expect(clientSource).toContain("destinationPage");
    expect(clientSource).toContain("Destination pages");
    expect(clientSource).toContain("Showing");
    expect(clientSource).toContain("of {MALAYSIA_DESTINATIONS.length} destinations");
  });

  it("keeps demo interactions honest and stateful", () => {
    expect(pageSource).toContain("searchParams");
    expect(clientSource).toContain("initialState");
    expect(clientSource).toContain("activeGuide");
    expect(clientSource).toContain("filteredVendors.slice(0, 8)");
    expect(clientSource).toContain("Trip builder");
    expect(clientSource).toContain("travelerCount");
    expect(clientSource).toContain("budgetRange");
    expect(clientSource).toContain("View all vendors");
    expect(clientSource).not.toContain("Search all experiences");
    expect(clientSource).not.toContain("Ready to find the right experience?");
    expect(clientSource).toContain("Discover your next region.");
    expect(clientSource).toContain("query.trim()");
    expect(clientSource).toContain("activities.length");
    expect(clientSource).not.toContain('<main className="overflow-hidden');
  });

  it("keeps the demo focused on curated discovery and the search handoff", () => {
    expect(clientSource).toContain('href="/customer/search"');
    expect(clientSource.match(/href="\/customer\/search"/g)).toHaveLength(1);
    expect(clientSource).toContain("/customer?state=");
    expect(clientSource).toContain('buildActivityPath(packagePick.id, "/customer")');
    expect(clientSource).not.toContain("/customer/design-demo?state=");
    expect(clientSource).not.toContain("atlas-controls");
    expect(clientSource).not.toContain("Malaysia in 16 moods");
    expect(clientSource).not.toContain("PromotionSpotlight");
    expect(clientSource).not.toContain("atlas-rail-slider");
  });

  it("uses white page surfaces instead of the retired beige canvas", () => {
    expect(clientSource).not.toContain("bg-[#f6f4ef]");
    expect(clientSource).not.toContain("bg-[#f1eadc]");
    expect(clientSource).not.toContain("bg-[#f8f2e5]");
    expect(clientSource).toContain("bg-background text-foreground");
  });

  it("keeps destination card imagery true to the source image", () => {
    expect(clientSource).toContain('Image src={destination.image}');
    expect(clientSource).toContain('className="object-cover transition duration-500 group-hover:scale-105"');
    expect(clientSource).not.toContain("bg-gradient-to-t from-[#00004d]/80 to-transparent");
  });

  it("opens the shared introduction modal for every destination card", () => {
    expect(clientSource).toContain('from "@/components/customer/destination-preview-modal"');
    expect(clientSource).toContain("previewDestination");
    expect(clientSource).toContain("setPreviewDestination(activeDestination)");
    expect(clientSource).toContain("setPreviewDestination(destination)");
    expect(clientSource).toContain("View destination");
    expect(clientSource).toContain("<DestinationPreviewModal");
    expect(clientSource).toContain("visibleDestinations.map((destination)");
  });
});
