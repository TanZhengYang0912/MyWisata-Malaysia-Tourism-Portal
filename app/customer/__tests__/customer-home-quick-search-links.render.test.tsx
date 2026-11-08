import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key === "ui.guest.discoverMalaysia" ? "Discover Malaysia" : key,
  }),
}));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ currentUser: null }) }));
vi.mock("@/components/providers/saved-destinations", () => ({
  useSavedDestinations: () => ({ savedStates: new Set<string>(["Penang"]), toggleSaved: vi.fn() }),
}));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({
  useCustomerCapabilityGate: () => () => true,
}));
vi.mock("@/components/customer/activity-card", () => ({ ActivityCard: () => null }));
vi.mock("@/components/customer/vendor-card", () => ({ VendorCard: () => null }));
vi.mock("@/components/customer/save-toggle-button", () => ({
  SaveToggleButton: ({ children, appearance: _appearance, saved, iconSize: _iconSize, ...buttonProps }: React.ButtonHTMLAttributes<HTMLButtonElement> & { appearance?: string; saved?: boolean; iconSize?: number }) => <button {...buttonProps} type="button" aria-pressed={saved}>{children}</button>,
}));
vi.mock("@/components/customer/promotion-campaign-spotlight", () => ({ PromotionCampaignSpotlight: () => null }));
vi.mock("@/components/customer/event-partners-section", () => ({ EventPartnersSection: () => null }));

import {
  CustomerHomeClient,
  HOME_DESTINATION_IMAGE_OVERRIDES,
} from "@/app/customer/customer-home-client";

describe("customer home Discover Malaysia hero", () => {
  it("renders the localized hero title with its dedicated editorial display face", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const markup = renderToStaticMarkup(
      <CustomerHomeClient highlightItems={[]} forYouItems={[]} vendors={[]} campaign={null} />,
    );
    consoleError.mockRestore();
    const title = markup.match(/<h1 class="[^"]*atlas-discover-title[^"]*"[\s\S]*?<\/h1>/)?.[0] ?? "";

    expect(title).toContain("atlas-discover-title");
    expect(title).toContain("font-[family-name:var(--font-discover-title)]");
    expect(title).toMatch(/<span class="[^"]*atlas-discover-title__lead[^"]*">Discover <\/span>/);
    expect(title).toMatch(/<span class="[^"]*atlas-discover-title__ending[^"]*">Malaysia<\/span>/);
  });

  it("renders the image-led title and removes typed search and shortcut content", () => {
    const renderErrors: unknown[][] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      renderErrors.push(args);
    });
    const markup = renderToStaticMarkup(
      <CustomerHomeClient highlightItems={[]} forYouItems={[]} vendors={[]} campaign={null} />,
    );
    const unexpectedRenderErrors = renderErrors.filter(
      ([message, ...values]) => !(
        String(message).includes("non-boolean attribute") && values.includes("jsx")
      ),
    );
    consoleError.mockRestore();

    expect(unexpectedRenderErrors).toEqual([]);
    expect(markup).toMatch(/Discover <\/span><span class="atlas-discover-title__ending[^\"]*">Malaysia/);
    expect(markup).not.toContain("ui.home.searchAria");
    expect(markup).not.toContain("ui.home.startExploring");
    expect(markup).not.toContain("ui.home.quickSearches");
    expect(markup).not.toContain("ui.home.destinationCount");
    expect(markup).not.toContain("ui.home.experienceCount");

    const destinationCarousel = markup.match(
      /<nav aria-label="ui\.home\.destinationCarousel"[\s\S]*?<\/nav>/,
    )?.[0] ?? "";
    const firstPageDestinations = ["Kuala Lumpur", "Penang", "Sabah", "Melaka"];
    const destinationPositions = firstPageDestinations.map((destination) =>
      destinationCarousel.indexOf(`>${destination}</span>`),
    );

    expect(destinationCarousel).not.toMatch(/>01<\/span> <span[^>]*>\/<\/span> 04/);
    expect(destinationCarousel).not.toContain('aria-label="ui.map.previous"');
    expect(destinationCarousel).not.toContain('aria-label="ui.map.next"');
    expect(destinationCarousel).toContain('aria-label="ui.home.destinationCarouselControls"');
    expect(destinationCarousel).toContain('aria-label="ui.home.viewDestination"');
    expect(destinationCarousel).not.toContain(">ui.home.viewDestination</a>");
    expect(destinationCarousel.match(/<button[^>]*aria-pressed="(?:true|false)"[^>]*class="group relative block/g)).toHaveLength(MALAYSIA_DESTINATIONS.length);
    expect(destinationPositions.every((position) => position >= 0)).toBe(true);
    expect(destinationPositions).toEqual([...destinationPositions].sort((left, right) => left - right));
  });

  it("offers a direct Saved toggle on every visible state card", () => {
    const markup = renderToStaticMarkup(
      <CustomerHomeClient highlightItems={[]} forYouItems={[]} vendors={[]} campaign={null} />,
    );
    const destinationCarousel = markup.match(
      /<nav aria-label="ui\.home\.destinationCarousel"[\s\S]*?<\/nav>/,
    )?.[0] ?? "";
    const saveLabels = Array.from(
      destinationCarousel.matchAll(/aria-label="(ui\.map\.(?:saveToAtlas|savedToAtlas))"/g),
      ([, label]) => label,
    );

    expect(saveLabels).toHaveLength(MALAYSIA_DESTINATIONS.length);
    expect(saveLabels[0]).toBe("ui.map.saveToAtlas");
    expect(saveLabels[1]).toBe("ui.map.savedToAtlas");
  });

  it("uses the refreshed local photography for the first four destinations", () => {
    const markup = renderToStaticMarkup(
      <CustomerHomeClient highlightItems={[]} forYouItems={[]} vendors={[]} campaign={null} />,
    );

    expect(markup).toContain("klcc-home-hero-match.webp");
    expect(markup).toContain("penang-home-destination.webp");
    expect(markup).toContain("sabah-home-destination.webp");
    expect(markup).toContain("melaka-home-destination.webp");
    expect(markup).not.toContain("penang-george-town.webp");
    expect(markup).not.toContain("sabah-mount-kinabalu.webp");
    expect(markup).not.toContain("melaka-a-famosa.webp");
  });

  it("shows the full destination photo on mobile and keeps the desktop cover", () => {
    const markup = renderToStaticMarkup(
      <CustomerHomeClient highlightItems={[]} forYouItems={[]} vendors={[]} campaign={null} />,
    );
    const heroMarkup = markup.slice(0, markup.indexOf('<nav aria-label="ui.home.destinationCarousel"'));
    const heroImages = Array.from(
      heroMarkup.matchAll(/<img\b(?=[^>]*class="atlas-hero-photo[^\"]*")[^>]*>/g),
      ([image]) => image,
    );

    expect(heroImages).toHaveLength(1);
    expect(heroImages[0]).toContain("klcc-home-hero-match.webp");
    expect(heroImages[0]).toContain("object-contain");
    expect(heroImages[0]).toContain("md:object-cover");
    expect(heroImages[0]).toContain('sizes="100vw"');
    expect(heroMarkup).not.toContain("atlas-hero-placeholder");
  });

  it("maps every Malaysia destination to an existing local homepage image", () => {
    const states = MALAYSIA_DESTINATIONS.map(({ state }) => state).sort();
    const mappedStates = Object.keys(HOME_DESTINATION_IMAGE_OVERRIDES).sort();

    expect(mappedStates).toEqual(states);

    for (const imagePath of Object.values(HOME_DESTINATION_IMAGE_OVERRIDES)) {
      expect(imagePath).toMatch(/^\/customer\/.+\.webp$/);
      expect(existsSync(resolve(process.cwd(), "public", imagePath.slice(1)))).toBe(true);
    }
  });

  it("requests every destination card image at its responsive rail width", () => {
    const markup = renderToStaticMarkup(
      <CustomerHomeClient highlightItems={[]} forYouItems={[]} vendors={[]} campaign={null} />,
    );
    const destinationImages = Array.from(
      markup.matchAll(/<img\b(?=[^>]*group-hover:scale-\[1\.045\])[^>]*>/g),
      ([image]) => image,
    );

    expect(destinationImages).toHaveLength(MALAYSIA_DESTINATIONS.length);
    expect(destinationImages.every((image) => image.includes(
      'sizes="(min-width: 1420px) 339px, (min-width: 1024px) calc(25vw - 16px), (min-width: 640px) calc(50vw - 48px), calc(50vw - 32px)"',
    ))).toBe(true);
  });
});
