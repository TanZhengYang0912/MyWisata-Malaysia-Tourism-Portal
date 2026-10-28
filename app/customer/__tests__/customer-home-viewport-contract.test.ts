import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const homeSource = readFileSync(
  resolve(process.cwd(), "app/customer/customer-home-client.tsx"),
  "utf8",
);
const homePageSource = readFileSync(
  resolve(process.cwd(), "app/customer/page.tsx"),
  "utf8",
);
const activityCardSource = readFileSync(
  resolve(process.cwd(), "components/customer/activity-card.tsx"),
  "utf8",
);
const vendorCardSource = readFileSync(
  resolve(process.cwd(), "components/customer/vendor-card.tsx"),
  "utf8",
);
const nextConfigSource = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");

describe("customer home first viewport", () => {
  it("uses a full-bleed photo hero and the existing localized Discover Malaysia title", () => {
    // The hero is one screen below the header's real height (published by useCustomerHeaderLayout), not a guess.
    expect(homeSource).toContain("min-h-[calc(100svh-var(--customer-header-h,");
    expect(homeSource).not.toContain("100svh-96px");
    expect(homeSource).not.toContain("100svh-64px");
    expect(homeSource).toContain("text-[clamp(4.2rem,min(9vw,14svh),9.2rem)]");
    expect(homeSource).toContain('t("ui.guest.discoverMalaysia")');
    expect(homeSource).toContain("atlas-hero-photo");
    expect(homeSource).toContain("object-cover");
    expect(homeSource).toContain('"Kuala Lumpur": "/customer/klcc-home-hero-match.webp"');
    expect(homeSource).toContain('Penang: "/customer/penang-home-destination.webp"');
    expect(homeSource).toContain('Sabah: "/customer/sabah-home-destination.webp"');
    expect(homeSource).toContain('Melaka: "/customer/melaka-home-destination.webp"');
    expect(homeSource).toContain("const activeHeroImage = activeDestination.image;");
    expect(homeSource).toContain('"object-[60%_center] sm:object-center"');
    expect(homeSource).not.toContain("petronas-twin-towers-skybridge.webp");
    expect(homeSource).toContain("atlas-title-accent");
    expect(homeSource).toContain("atlas-title-accent ml-28");
    expect(homeSource).not.toContain('t("ui.home.searchAria")');
    expect(homeSource).not.toContain('t("ui.home.startExploring")');
    expect(homeSource).not.toContain('t("ui.home.quickSearches")');
    expect(homeSource).not.toContain('t("ui.home.destinationCount")');
    expect(homeSource).not.toContain('t("ui.home.experienceCount")');
  });

  it("uses an expressive Instrument Serif title with room for the y descender", () => {
    expect(homePageSource).toContain("import { Instrument_Serif } from \"next/font/google\"");
    expect(homePageSource).toContain('weight: "400"');
    expect(homePageSource).toContain('style: "italic"');
    expect(homeSource).toMatch(/<h1 className="[^"]*atlas-discover-title[^"]*font-normal[^"]*leading-\[1\.05\][^"]*"/);
    expect(homeSource).toContain("font-style: italic;");
    expect(homeSource).toContain("font-weight: 400;");
    expect(homeSource).not.toContain('font-variation-settings: "SOFT" 35, "WONK" 1;');
    expect(homeSource).toContain("var(--malaysia-yellow)");
    expect(homeSource).toContain("var(--malaysia-red)");
    expect(homeSource).toContain("var(--malaysia-red) 55%, #fff1d2) 58%");
    expect(homeSource).toContain("text-shadow: 0 3px 18px");
    expect(homeSource).toMatch(/<svg\s+className="atlas-title-accent/);
    expect(homeSource).toMatch(/<path\s+className="atlas-title-accent__stroke"/);
    expect(homeSource).toContain('d="M4 20 C 72 15 146 5 222 7"');
    expect(homeSource).toContain("pathLength={1}");
    expect(homeSource).toContain("atlas-accent-draw");
    expect(homeSource).toContain("stroke-dashoffset: 1;");
    expect(homeSource).toContain("stroke-dashoffset: 0;");
  });

  it("uses responsive snap pages without changing the selected destination", () => {
    expect(homeSource).toContain('"Kuala Lumpur", "Penang", "Sabah", "Melaka"');
    expect(homeSource).toContain("scroll-snap-type: x mandatory");
    // The browser scrolls the rail under the finger (iPhone Safari cancels JS-only swipes); touch-action must not block it.
    const pagerRule = homeSource.match(/\.atlas-destination-pager \{([^}]*)\}/)?.[1] ?? "";
    expect(pagerRule).toContain("overflow-x: auto");
    expect(pagerRule).not.toMatch(/touch-action/);
    expect(homeSource).not.toContain("onClickCapture={destinationPager.suppressClickAfterTouch}");
    expect(homeSource).toContain("scroll-snap-align: none");
    // Cards per page follow the rail's own width (about 220px minimum per card), not fixed breakpoints.
    expect(homeSource).toContain("container: destination-rail / inline-size;");
    expect(homeSource).toContain("@container destination-rail (width < 692px)");
    expect(homeSource).toContain("@container destination-rail (692px <= width < 928px)");
    expect(homeSource).toContain("@container destination-rail (928px <= width < 1164px)");
    expect(homeSource).toContain("@container destination-rail (width >= 1164px)");
    for (const perPage of [2, 3, 4, 5]) {
      expect(homeSource).toContain(`--per-page: ${perPage}`);
      expect(homeSource).toContain(`nth-child(${perPage}n + 1)`);
    }
    expect(homeSource).not.toMatch(/@media \(min-width: 1024px\) \{\s*\.atlas-destination-pager/);
    expect(homeSource).toContain("scroll-snap-stop: always");
    // Card height comes from the screen height so the hero fits one screen at any width.
    expect(homeSource).toContain("h-[clamp(108px,22svh,220px)]");
    expect(homeSource).not.toContain("h-[108px]");
    // The trailing padding shrinks the content box by one gap, so a page of N cards plus N gaps equals the viewport only
    // when each card subtracts (N - 1) gaps.
    expect(homeSource).toContain("flex: 0 0 calc((100% - ((var(--per-page) - 1) * var(--destination-gap))) / var(--per-page));");
    expect(homeSource).toContain("padding-right: var(--destination-gap)");
    expect(homeSource).toContain("useHomeDestinationPager(");
    expect(homeSource).toContain('import { ArrowRight, ArrowUpRight, CalendarDays, MapPin, Sparkles } from "lucide-react"');
    expect(homeSource).toContain('aria-label={t("ui.home.viewDestination")}');
    expect(homeSource).not.toContain('{t("ui.home.viewDestination")} <ArrowRight');
    expect(homeSource).toContain("aria-pressed={isSelected}");
    expect(homeSource).toContain("selectDestination(destination.state)");
    expect(homeSource).toContain("atlas-selected-progress");
    expect(homeSource).toContain('aria-label={t("ui.home.destinationCarousel")');

    const cardMappingStart = homeSource.indexOf("HOME_DESTINATIONS.map((destination) => {");
    const cardMappingEnd = homeSource.indexOf("          </nav>", cardMappingStart);
    const cardMapping = homeSource.slice(cardMappingStart, cardMappingEnd);
    expect(cardMapping).toContain("<SaveToggleButton");
    expect(cardMapping).toContain("savedStates.has(destination.state)");
    expect(cardMapping).toContain("toggleSaved(destination.state)");
    expect(cardMapping).toMatch(/<\/button>\s*<SaveToggleButton/);
    expect(homeSource).toContain("sizes={{ dot: 11, pill: 36, gap: 8 }}");
    expect(homeSource).toContain("sizes={{ dot: 14, pill: 50, gap: 10 }}");
    // Dots follow the real page count.
    expect(homeSource.match(/count=\{destinationPager\.pageCount\}/g)).toHaveLength(2);
    expect(homeSource).not.toMatch(/count=\{[48]\}/);
  });

  it("keeps the hero photo animation while limiting its zoom", () => {
    expect(homeSource).not.toContain("@keyframes atlas-photo-reveal");
    expect(homeSource).toContain("@keyframes atlas-photo-breathe");
    expect(homeSource).toContain("from { transform: scale(1.005); }");
    expect(homeSource).toContain("to { transform: scale(1.015); }");
    expect(homeSource).toContain(":global(.atlas-hero-photo) {");
    expect(homeSource).toContain("animation: none;");
  });

  it("crossfades to a destination photo only after it loads and cleans up the old photo", () => {
    expect(homeSource).toContain("outgoingHeroState");
    expect(homeSource).toContain("incomingHeroVisible");
    expect(homeSource).toContain("atlas-hero-photo--outgoing");
    expect(homeSource).toContain("atlas-hero-photo--incoming-visible");
    expect(homeSource).toContain("onLoad={() => handleHeroPhotoLoaded(activeDestination.state)}");
    expect(homeSource).toContain("onTransitionEnd={(event) => completeHeroPhotoTransition(event, activeDestination.state)}");
    expect(homeSource).toContain("transition: opacity 240ms var(--atlas-ease-out);");
    expect(homeSource).toContain("transition-duration: 120ms;");
    expect(homeSource).toContain("HERO_CROSSFADE_DURATION_MS");
  });

  it("reveals the selected destination marker with a restrained left-origin transition", () => {
    expect(homeSource).toContain("atlas-selected-progress--active");
    expect(homeSource).toContain("transform-origin: left center;");
    expect(homeSource).toContain("transform: scaleX(0.85);");
    expect(homeSource).toContain("transform: scaleX(1);");
    expect(homeSource).toContain("transition: transform 160ms var(--atlas-ease-out), opacity 160ms var(--atlas-ease-out);");
    expect(homeSource).toContain("transition-duration: 100ms;");
  });

  it("keeps landmark photos visible under the readable hero overlay", () => {
    expect(homeSource).toContain("rgba(4,15,36,0.27)_0%");
    expect(homeSource).toContain("rgba(4,15,36,0.16)_27%");
    expect(homeSource).toContain("rgba(4,17,39,0.36)_0%");
    expect(homeSource).toContain("rgba(4,17,39,0.16)_22%");
    expect(homeSource).toContain("filter: brightness(1.07) contrast(1.06) saturate(1.08);");
  });

  it("allows the selected hero's sharper quality without unrestricted optimizer qualities", () => {
    expect(homeSource).toContain("quality={90}");
    expect(homeSource).toContain('loading="eager"');
    expect(homeSource).toContain("atlas-hero-placeholder");
    expect(homeSource).toContain("quality={75}");
    expect(nextConfigSource).toContain("qualities: [75, 90]");
  });

  it("exposes clickable Worm page controls instead of arrow buttons", () => {
    expect(homeSource).toContain("HomeDestinationWormIndicator");
    expect(homeSource).toContain('label={t("ui.home.destinationCarouselControls")}');
    expect(homeSource).not.toContain("ChevronLeft");
    expect(homeSource).not.toContain("ChevronRight");
    expect(homeSource).not.toContain("changeDestinationPage(direction:");
    expect(homeSource).not.toContain("HOME_DESTINATIONS.slice(");
  });

  it("keeps the homepage discovery shelf under the Featured Highlights label", () => {
    expect(homeSource).toContain("const highlightItems = groupAccommodationByProperty(popular).slice(0, 4)");
    expect(homeSource).toContain("groupAccommodationByProperty(recommended).filter((activity) => !highlightIds.has(activity.id)).slice(0, 4)");
    expect(homeSource).toContain('t("ui.home.featuredHighlights")');
    expect(homeSource).toContain('t("ui.home.forYou")');
    expect(homeSource).toContain("!isGuest && forYouItems.length > 0");
    expect(homeSource).not.toContain('t("ui.home.popularExperiences")');
    expect(homeSource).not.toContain('t("ui.home.localDelicacies")');
    expect(homeSource).toContain('t("ui.actions.viewAll")');
  });

  it("orders For You below Highlights, then Event, Nearby, and Featured Partners", () => {
    const highlightsIndex = homeSource.indexOf('t("ui.home.featuredHighlights")');
    const forYouIndex = homeSource.indexOf('t("ui.home.forYou")');
    const eventPartnersIndex = homeSource.indexOf('<EventPartnersSection');
    const nearbyPartnersIndex = homeSource.indexOf('t("ui.home.nearbyPartners")');
    const featuredPartnersIndex = homeSource.indexOf('t("ui.home.featuredPartners")');

    expect(highlightsIndex).toBeGreaterThanOrEqual(0);
    expect(forYouIndex).toBeGreaterThan(highlightsIndex);
    expect(eventPartnersIndex).toBeGreaterThan(forYouIndex);
    expect(nearbyPartnersIndex).toBeGreaterThan(eventPartnersIndex);
    expect(featuredPartnersIndex).toBeGreaterThan(nearbyPartnersIndex);
    expect(homeSource).toContain("eventPartners.slice(0, 4)");
    expect(homeSource).toContain("vendors.slice(0, 4)");
    expect(homeSource).toContain("highlightItems.map((activity)");
    expect(homeSource).toContain("forYouItems.map((activity)");
    expect(homePageSource).toContain("campaign.vendors.map((vendor) => vendor.vendorId)");
    expect(homePageSource).toContain("eventVendorIds");
    expect(homePageSource).toContain('.in("id", eventVendorIds)');
    expect(homePageSource).toContain("nextVendorEvent");
  });

  it("only requests device location after the nearby-partner action and caps results at four", () => {
    expect(homeSource).toContain('fetch("/api/customer/nearby-partners"');
    expect(homeSource).toContain("navigator.geolocation.getCurrentPosition");
    expect(homeSource).toContain("nearbyPartners.slice(0, 4)");
    expect(homeSource).toContain('href="/customer/partners"');
    expect(homeSource).not.toContain("detailsRevealStyle");
  });

  it("supports detail reveal on home product and partner cards", () => {
    expect(homeSource).not.toContain("detailsRevealOnHover");
    expect(activityCardSource).toContain("<ExpandCard");
    expect(activityCardSource).toContain("details={detailContent}");
    expect(readFileSync(resolve(process.cwd(), "components/customer/expand-card.tsx"), "utf8")).toContain("mw-card-body-compact");
    expect(activityCardSource).not.toContain("detailsRevealOnHover");
    expect(activityCardSource).not.toContain("bg-primary/95");
    expect(vendorCardSource).toContain("<ExpandCard");
    expect(vendorCardSource).not.toContain("detailsRevealOnHover");
    expect(vendorCardSource).not.toContain("aria-expanded");
  });

  it("uses the compact map-style reveal across the homepage product and vendor cards", () => {
    const forYouStart = homeSource.indexOf('aria-labelledby="for-you-heading"');
    const forYouEnd = homeSource.indexOf("<EventPartnersSection", forYouStart);
    const forYouSection = homeSource.slice(forYouStart, forYouEnd);
    const highlightsStart = homeSource.indexOf('aria-labelledby="featured-highlights-heading"');
    const highlightsEnd = homeSource.indexOf("</section>", highlightsStart);
    const highlightsSection = homeSource.slice(highlightsStart, highlightsEnd);
    const featuredVendorStart = homeSource.indexOf("return <VendorCard");
    const featuredVendorEnd = homeSource.indexOf(" />;", featuredVendorStart);
    const featuredVendorCall = homeSource.slice(featuredVendorStart, featuredVendorEnd);

    expect(forYouSection).toContain("forYouItems.map((activity)");
    expect(forYouSection).toContain("<ActivityCard");
    expect(forYouSection).not.toContain("detailsRevealStyle");
    expect(highlightsSection).toContain("<ActivityCard");
    expect(highlightsSection).not.toContain("detailsRevealStyle");
    expect(featuredVendorCall).toContain("<VendorCard");
    expect(featuredVendorCall).not.toContain("detailsRevealStyle");
    expect(homeSource).toContain('id="featured-highlights-heading" className="font-[family-name:var(--font-display)] text-2xl');
    expect(homeSource).toContain('id="for-you-heading" className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl');
    expect(homeSource).toContain('text-2xl font-bold font-[family-name:var(--font-display)]');
  });

  it("keeps generic marketing copy out of the customer home and moves the calendar below the hero", () => {
    expect(homeSource).not.toContain("heroDescription");
    expect(homeSource).not.toContain("featuredHighlightsSubtitle");
    expect(homeSource).not.toContain("eventCalendarKicker");
    expect(homeSource).not.toContain("eventCalendarPromptDescription");
    expect(homeSource).not.toContain("wanderWays");
    expect(homeSource).toContain('t("ui.guest.discoverMalaysia")');
    const heroStart = homeSource.indexOf('<section className="atlas-hero-section');
    const heroEnd = homeSource.indexOf("</section>", heroStart);
    const calendarEntry = homeSource.indexOf('t("ui.home.eventCalendar")', heroStart);
    expect(calendarEntry).toBeGreaterThan(heroEnd);
  });

  it("does not expose vendor business-type translation keys in Featured Partners cards", () => {
    expect(homeSource).not.toContain("ui.vendor.businessTypes");
    expect(homeSource).not.toContain("customer:ui.vendor");
    expect(homeSource).toContain('t("ui.home.vendorDescription", { location })');
  });

  it("offers a customer event calendar popup from the home route", () => {
    expect(homeSource).toContain("EventCalendarDialog");
    expect(homeSource).toContain('t("ui.home.viewEventCalendar")');
    expect(homeSource).toContain('aria-label={t("ui.home.eventCalendar")');
  });
});
