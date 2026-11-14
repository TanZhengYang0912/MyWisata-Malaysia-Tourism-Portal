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
  resolve(process.cwd(), "components/customer/product-card.tsx"),
  "utf8",
);
const vendorCardSource = readFileSync(
  resolve(process.cwd(), "components/customer/vendor-card.tsx"),
  "utf8",
);
const eventPartnersSource = readFileSync(resolve(process.cwd(), "components/customer/event-partners-section.tsx"), "utf8");
const nextConfigSource = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");

describe("customer home first viewport", () => {
  it("uses a full-bleed photo hero and active destination title", () => {
    // Title and photo are one 16:9 picture sized in container units, so every screen shows the same picture,
    // and the hero no longer has to fill one screen.
    expect(homeSource).toContain('<section className="atlas-hero-section @container relative isolate bg-background text-white">');
    expect(homeSource).toContain('<div className="relative aspect-video overflow-hidden bg-[#061326]">');
    expect(homeSource).not.toContain("min-h-[calc(100svh-var(--customer-header-h,");
    expect(homeSource).toContain("text-[8.6cqw]");
    expect(homeSource).toContain("{activeDestination.state}");
    expect(homeSource).toContain("atlas-hero-photo");
    expect(homeSource).toContain("object-cover");
    expect(homeSource).toContain('"Kuala Lumpur": "/customer/klcc-home-hero-match.webp"');
    expect(homeSource).toContain('Penang: "/customer/penang-home-destination.webp"');
    expect(homeSource).toContain('Sabah: "/customer/sabah-home-destination.webp"');
    expect(homeSource).toContain('Melaka: "/customer/melaka-home-destination.webp"');
    expect(homeSource).toContain("const activeHeroImage = activeDestination.image;");
    expect(homeSource).not.toContain("object-contain md:object-cover");
    expect(homeSource).toContain('"object-[60%_48%] md:object-center"');
    expect(homeSource).not.toContain("atlas-hero-placeholder");
    expect(homeSource).not.toContain("petronas-twin-towers-skybridge.webp");
    expect(homeSource).toContain("atlas-title-accent");

    expect(homeSource).toContain("<HomeDestinationWormIndicator");
    expect(homeSource).toContain("useHomeDestinationPager");
    expect(homeSource).toContain('className="atlas-enter atlas-delay-1 absolute left-[6cqw] top-[7.5cqw] z-10"');
    expect(homeSource).toContain('className="atlas-title-accent ml-[8cqw] mt-[1.6cqw] block w-[16cqw] text-[#f4b900]"');
    // From 1024px the cards sit over the photo's foot; below that they take their own row under it.
    expect(homeSource).toContain("relative z-10 px-5 pt-4 sm:px-9 lg:absolute lg:inset-x-[4.5cqw] lg:bottom-[1.6cqw] lg:p-0");
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
    expect(homeSource).not.toContain("font-size: clamp(4.2rem, 9vw, 9.2rem);");
    expect(homeSource).not.toContain('font-variation-settings: "SOFT" 35, "WONK" 1;');
    const sharedTitleStyle = homeSource.match(/\.atlas-discover-title__lead,\s*\.atlas-discover-title__ending \{([^}]*)\}/)?.[1] ?? "";
    // width and a negative margin do nothing on the inline title span.
    expect(sharedTitleStyle).not.toContain("width: fit-content;");
    expect(sharedTitleStyle).toContain("linear-gradient(108deg, #fff8e9 0%, #fff1d2 28%, var(--malaysia-yellow) 78%, #f4b900 100%)");
    expect(sharedTitleStyle).toContain("-webkit-text-fill-color: transparent;");
    expect(sharedTitleStyle).not.toContain("var(--malaysia-red)");
    expect(homeSource).toContain(".atlas-discover-title__lead,");
    expect(homeSource).toContain(".atlas-discover-title__ending {");
    expect(sharedTitleStyle).toContain("padding: 0 .12em .22em 0;");
    expect(sharedTitleStyle).not.toContain("margin-bottom: -.22em;");
    expect(homeSource).not.toContain("background-image: none;");
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
    // Four destinations per page from 1024px, three on tablets, two on phones.
    expect(homeSource).toContain("@media (min-width: 1024px)");
    expect(homeSource).toContain("@media (min-width: 640px) and (max-width: 1023.98px)");
    expect(homeSource).toContain("@media (max-width: 639.98px)");
    expect(homeSource).not.toContain("@container destination-rail (");
    for (const perPage of [2, 3, 4]) {
      expect(homeSource).toContain(`--per-page: ${perPage}`);
      expect(homeSource).toContain(`nth-child(${perPage}n + 1)`);
    }
    expect(homeSource).toContain("scroll-snap-stop: always");
    // Desktop hover grows the whole destination card (photo, name and save) to 1.04, from its outer edge so the
    // scrolling rail never clips it; the photo itself no longer zooms on its own.
    expect(homeSource).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.atlas-destination-card:hover \{ scale: 1\.04; z-index: 2; \}/);
    expect(homeSource).toContain(".atlas-destination-card:nth-child(4n + 1) { transform-origin: top left; }");
    expect(homeSource).toContain(".atlas-destination-card:nth-child(4n) { transform-origin: top right; }");
    expect(homeSource).toContain(".atlas-destination-card:nth-child(3n) { transform-origin: top right; }");
    // The yellow marker grows with its card; the rail's bottom padding keeps it from being clipped while scaled.
    expect(homeSource).toContain('className="atlas-destination-pager pb-6"');
    expect(homeSource).toContain(".atlas-destination-card:hover { scale: none; }");
    expect(homeSource).not.toContain("group-hover:scale-[1.045]");
    // Square cards on phones, 4:3 on tablets, and on desktop a height that scales with the picture.
    expect(homeSource).toContain("aspect-square");
    expect(homeSource).toContain("sm:aspect-[4/3] lg:aspect-auto lg:h-[13cqw]");
    expect(homeSource).not.toContain("h-[clamp(108px,22svh,220px)]");
    expect(homeSource).not.toContain("h-[108px]");
    // The trailing padding shrinks the content box by one gap, so a page of N cards plus N gaps equals the viewport only
    // when each card subtracts (N - 1) gaps.
    expect(homeSource).toContain("flex: 0 0 calc((100% - ((var(--per-page) - 1) * var(--destination-gap))) / var(--per-page));");
    expect(homeSource).toContain("padding-right: var(--destination-gap)");
    expect(homeSource).toContain("useHomeDestinationPager(");
    expect(homeSource).toContain('import { ChevronLeft, ChevronRight, MapPin, Sparkles } from "lucide-react"');
    expect(homeSource).toContain('aria-label={t("ui.map.previous")}');
    expect(homeSource).toContain('aria-label={t("ui.map.next")}');
    expect(homeSource).not.toContain('{t("ui.home.viewDestination")} <ArrowRight');
    expect(homeSource).toContain("aria-pressed={isSelected}");
    expect(homeSource).toContain("selectDestination(destination.state)");
    expect(homeSource).toContain("atlas-selected-progress");
    expect(homeSource).toContain('aria-label={t("ui.home.destinationCarousel")');

    const cardMappingStart = homeSource.indexOf("HOME_DESTINATIONS.map((destination) => {");
    const cardMappingEnd = homeSource.indexOf("        </nav>", cardMappingStart);
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
    expect(homeSource).toContain('sizes="100vw"');
    expect(homeSource).not.toContain("atlas-hero-placeholder");
    expect(nextConfigSource).toContain("qualities: [75, 90]");
  });

  it("exposes pager arrows alongside clickable Worm page controls", () => {
    expect(homeSource).toContain("HomeDestinationWormIndicator");
    expect(homeSource).toContain('label={t("ui.home.destinationCarouselControls")}');
    expect(homeSource).toContain('aria-label={t("ui.map.previous")}');
    expect(homeSource).toContain('aria-label={t("ui.map.next")}');
    // Arrows sit on the worm's row, right-aligned: transparent, accent on hover/press, dimmed white when disabled.
    const railSource = homeSource.slice(homeSource.indexOf("atlas-destination-pager pb-6"), homeSource.indexOf("</nav>"));
    expect(railSource.indexOf("HomeDestinationWormIndicator")).toBeLessThan(railSource.indexOf('aria-label={t("ui.map.previous")}'));
    // Arrows stay at the right edge (the user chose not to move them clear of the chat button).
    expect(homeSource).toContain('<div className="ml-auto flex items-center">');
    expect(homeSource).not.toContain("max-lg:pr-16");
    // Dark on the page background below 1024px, white over the photo from 1024px.
    for (const token of ["text-foreground", "hover:bg-transparent", "hover:text-accent", "active:bg-transparent", "active:text-accent", "active:scale-[.94]", "disabled:text-foreground/30", "disabled:opacity-100", "dark:hover:bg-transparent", "lg:text-white", "lg:disabled:text-white/30"]) {
      expect(homeSource).toContain(token);
    }
    expect(homeSource).not.toContain("changeDestinationPage(direction:");
    expect(homeSource).not.toContain("HOME_DESTINATIONS.slice(");
  });

  it("keeps the homepage discovery shelf under the Featured Highlights label", () => {
    expect(homePageSource).toContain("selectHomeDiscoverySections(activities, recommended, placements, requestedAt)");
    expect(homeSource).toContain("highlightItems: (DiscoveryResult & { property?: DiscoveryPropertySummary })[]");
    expect(homeSource).toContain("forYouItems: (ComputedActivity & { property?: DiscoveryPropertySummary })[]");
    expect(homeSource).not.toContain("groupAccommodationByProperty(popular)");
    expect(homeSource).toContain('t("ui.home.featuredHighlights")');
    expect(homeSource).toContain('t("ui.home.forYou")');
    expect(homeSource).toContain("!isGuest && forYouItems.length > 0");
    expect(homeSource).not.toContain('t("ui.home.popularExperiences")');
    expect(homeSource).not.toContain('t("ui.home.localDelicacies")');
    expect(homeSource).toContain('<SeeMoreLink href="/customer/explore" />');
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
    expect(homeSource).toContain("eventPartners.slice(0, HOME_HIGHLIGHT_LIMIT)");
    expect(homeSource).toContain("vendors.slice(0, HOME_HIGHLIGHT_LIMIT)");
    expect(homeSource).toContain("featuredHighlights.map((activity)");
    expect(homeSource).toContain("forYouItems.map((activity)");
    expect(homePageSource).toContain("campaign.vendors.map((vendor) => vendor.vendorId)");
    expect(homePageSource).toContain("eventVendorIds");
    expect(homePageSource).toContain("getCachedEventPartnerVendors(vendorIds)");
    expect(readFileSync(resolve(process.cwd(), "lib/cache/catalogue-cache.ts"), "utf8")).toContain(".in('id', vendorIds)");
    expect(homePageSource).toContain("nextVendorEvent");
  });

  it("only requests device location after the nearby-partner action and caps results at four", () => {
    expect(homeSource).toContain('fetch("/api/customer/nearby-partners"');
    expect(homeSource).toContain("navigator.geolocation.getCurrentPosition");
    // The API returns four; the carousel shows up to the shared Home limit.
    expect(homeSource).toContain("body.data.partners.slice(0, 4)");
    expect(homeSource).toContain("nearbyPartners.slice(0, HOME_HIGHLIGHT_LIMIT)");
    expect(homeSource).toContain('href="/customer/vendors"');
    expect(homeSource).not.toContain("detailsRevealStyle");
  });

  it("uses the shared CardFrame, with no drawer, on home product and partner cards", () => {
    expect(homeSource).not.toContain("detailsRevealOnHover");
    expect(activityCardSource).toContain("<CardFrame");
    expect(activityCardSource).not.toContain("ExpandCard");
    expect(activityCardSource).not.toContain("bg-primary/95");
    expect(vendorCardSource).toContain("<CardFrame");
    expect(vendorCardSource).not.toContain("aria-expanded");
  });

  it("uses the compact map-style reveal across the homepage product and vendor cards", () => {
    const forYouStart = homeSource.indexOf('aria-labelledby="for-you-heading"');
    const forYouEnd = homeSource.indexOf("<EventPartnersSection", forYouStart);
    const forYouSection = homeSource.slice(forYouStart, forYouEnd);
    const highlightsStart = homeSource.indexOf('aria-labelledby="featured-highlights-heading"');
    const highlightsEnd = homeSource.indexOf("</section>", highlightsStart);
    const highlightsSection = homeSource.slice(highlightsStart, highlightsEnd);
    const featuredVendorStart = homeSource.indexOf("vendors.slice(0, HOME_HIGHLIGHT_LIMIT).map");
    const featuredVendorEnd = homeSource.indexOf("</CardCarousel>", featuredVendorStart);
    const featuredVendorCall = homeSource.slice(featuredVendorStart, featuredVendorEnd);

    expect(forYouSection).toContain("forYouItems.map((activity)");
    expect(forYouSection).toContain("<ActivityCard");
    expect(forYouSection).toContain('<ProductCard key={activity.id} listing={toDiscoveryCatalogueCard(activity, { labels: false })} returnTo="/customer" />');
    expect(forYouSection).not.toContain("detailsRevealStyle");
    expect(highlightsSection).toContain("<ActivityCard");
    expect(highlightsSection).not.toContain("detailsRevealStyle");
    expect(featuredVendorCall).toContain("<VendorCard");
    expect(featuredVendorCall).not.toContain("detailsRevealStyle");
    expect(homeSource).toContain('id="featured-highlights-heading" className="font-[family-name:var(--font-display)] text-2xl');
    expect(homeSource).toContain('id="for-you-heading" className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl');
    expect(homeSource).toContain('text-2xl font-bold font-[family-name:var(--font-display)]');
  });

  it("pages Featured Highlights in a card carousel and records impressions only for the page it settles on", () => {
    expect(homeSource).toContain('<CardCarousel label={t("ui.home.featuredHighlights")} onPageView={recordHighlightImpressions}>');
    expect(homeSource).toContain("featuredHighlights.slice(first, first + perPage)");
    expect(homeSource).not.toContain("pageHomeHighlights");
    for (const href of ["/customer/explore", "/customer/for-you", "/customer/vendors"]) {
      expect(homeSource).toContain(`<SeeMoreLink href="${href}" />`);
    }
  });

  it("puts a line under every card-carousel section header, with See more centred on the title", () => {
    const header = "flex items-center justify-between gap-4 border-b border-border/70 pb-4";
    expect(homeSource.split(header).length - 1).toBe(2);
    expect(homeSource).toContain(`flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-4`);
    expect(eventPartnersSource).toContain(header);
    expect(homeSource.match(/<CardCarousel /g)).toHaveLength(3);
    expect(eventPartnersSource).toContain("<CardCarousel ");
  });

  it("keeps generic marketing copy and the event calendar card out of the customer home", () => {
    expect(homeSource).not.toContain("heroDescription");
    expect(homeSource).not.toContain("featuredHighlightsSubtitle");
    expect(homeSource).not.toContain("eventCalendarKicker");
    expect(homeSource).not.toContain("eventCalendarPromptDescription");
    expect(homeSource).not.toContain("wanderWays");
    expect(homeSource).toContain("{activeDestination.state}");
    expect(homeSource).not.toContain('t("ui.home.eventCalendar")');
    expect(homeSource).not.toContain('t("ui.home.viewEventCalendar")');
  });

  it("does not expose vendor business-type translation keys in Featured Partners cards", () => {
    expect(homeSource).not.toContain("ui.vendor.businessTypes");
    expect(homeSource).not.toContain("customer:ui.vendor");
    expect(homeSource).not.toContain("ui.home.vendorDescription");
  });

  it("does not load or render the event calendar dialog from the home route", () => {
    expect(homeSource).not.toContain("EventCalendarDialog");
    expect(homeSource).not.toContain("eventCalendarOpen");
  });
});
