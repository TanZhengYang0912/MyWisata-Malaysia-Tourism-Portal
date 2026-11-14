import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEMO_STATES } from "@/lib/demo-map/data";
import { getStateFlagSrc } from "@/lib/demo-map/state-flags";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }) }));
vi.mock("next/dynamic", () => ({ default: () => function DynamicMock() { return null; } }));
vi.mock("next/image", () => ({
  default: (props: { src: string; alt?: string; width?: number; height?: number; className?: string; "aria-hidden"?: boolean }) => (
    <span
      data-image-src={props.src}
      data-image-alt={props.alt ?? ""}
      data-image-width={props.width}
      data-image-height={props.height}
      data-image-class={props.className}
      data-image-aria-hidden={props["aria-hidden"]}
    />
  ),
}));

import { EventsMap } from "../events-map";

function makeCampaign(index: number): PromotionCampaignPublic {
  return {
    id: `campaign-${index}`,
    slug: `campaign-${index}`,
    title: `Campaign ${index}`,
    summary: "A campaign summary.",
    description: "Campaign details.",
    posterUrl: null,
    operatingHours: null,
    startsAt: "2026-11-01T02:00:00.000Z",
    endsAt: "2027-01-01T02:00:00.000Z",
    visibility: "live",
    locations: [{
      id: `location-${index}`,
      name: "Unknown location",
      address: null,
      lat: null,
      lng: null,
      startsOn: "2026-11-01",
      endsOn: "2099-12-31",
      opensAt: "10:00",
      closesAt: "22:00",
    }],
    vendors: [],
  };
}

describe("Events state count flags", () => {
  it("shows each state flag decoratively beside its existing state-count row", () => {
    const markup = renderToStaticMarkup(<EventsMap campaigns={[]} />);

    expect(markup).not.toContain("ui.promotionCampaigns.map.stateCountsDescription");
    const stateRows = markup.match(/<button[^>]*aria-label="ui\.promotionCampaigns\.map\.stateCountLabel"[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(stateRows).toHaveLength(16);

    for (const [index, state] of DEMO_STATES.entries()) {
      expect(stateRows[index]).toContain(`data-image-src="${getStateFlagSrc(state.id)}"`);
    }
    expect(markup).toContain('data-image-alt=""');
    expect(markup).toContain('data-image-aria-hidden="true"');
    expect(markup).toContain('data-image-width="32"');
    expect(markup).toContain('data-image-height="16"');
  });

  it("uses three columns for three or more visible events and two for smaller sets", () => {
    const threeEventMarkup = renderToStaticMarkup(<EventsMap campaigns={[makeCampaign(1), makeCampaign(2), makeCampaign(3)]} />);
    const twoEventMarkup = renderToStaticMarkup(<EventsMap campaigns={[makeCampaign(1), makeCampaign(2)]} />);

    expect(threeEventMarkup).toContain("md:grid-cols-2 xl:grid-cols-3");
    expect(twoEventMarkup).toContain("md:grid-cols-2 xl:grid-cols-2");
  });
});
