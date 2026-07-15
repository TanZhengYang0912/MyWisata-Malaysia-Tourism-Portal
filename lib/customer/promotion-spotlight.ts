import type { ComputedActivity } from "@/backend/core/types";

export interface PromotionSpotlightItem {
  activityId: string;
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  href: string;
  ctaLabel: string;
  accent: "yellow" | "teal" | "coral";
}

type Campaign = Omit<PromotionSpotlightItem, "activityId" | "image" | "href"> & {
  matches: (activity: ComputedActivity) => boolean;
};

const CAMPAIGNS: Campaign[] = [
  {
    matches: (activity) => /food|dining|culinary|cafe|restaurant/i.test(`${activity.category} ${activity.name}`),
    eyebrow: "TASTE MALAYSIA",
    title: "Make room for local flavour",
    description: "Find the stalls, kitchens and food stories that turn a trip into a memory.",
    ctaLabel: "Explore this experience",
    accent: "yellow",
  },
  {
    matches: (activity) => /sabah|sarawak|labuan/i.test(`${activity.outlet.state} ${activity.outlet.city}`),
    eyebrow: "BORNEO CALLING",
    title: "Go further, feel more",
    description: "Trade the usual itinerary for a closer look at Malaysia’s wild side.",
    ctaLabel: "Discover the route",
    accent: "teal",
  },
  {
    matches: () => true,
    eyebrow: "WEEKEND PICKS",
    title: "Your next good day starts here",
    description: "Handpicked local experiences, ready when you are.",
    ctaLabel: "View the experience",
    accent: "coral",
  },
];

export function buildPromotionSpotlight(activities: ComputedActivity[]): PromotionSpotlightItem[] {
  const unused = [...activities];

  return CAMPAIGNS.flatMap((campaign) => {
    const index = unused.findIndex(campaign.matches);
    if (index === -1) return [];

    const [activity] = unused.splice(index, 1);
    return [{
      activityId: activity.id,
      eyebrow: campaign.eyebrow,
      title: campaign.title,
      description: campaign.description,
      image: activity.image,
      href: `/customer/activity/${activity.id}`,
      ctaLabel: campaign.ctaLabel,
      accent: campaign.accent,
    }];
  });
}
