import type {
  PromotionCampaignOfferEligibility,
  PromotionCampaignPublic,
  PromotionCampaignSelection,
  PromotionCampaignVisibility,
} from "@/lib/promotion-campaigns/types";

type CampaignTimeInput = {
  status: string;
  startsAt: string;
  endsAt: string;
};

export function getCampaignVisibility(
  campaign: CampaignTimeInput,
  now: Date = new Date(),
): PromotionCampaignVisibility | null {
  if (campaign.status !== "approved") return null;

  const startsAt = Date.parse(campaign.startsAt);
  const endsAt = Date.parse(campaign.endsAt);
  const currentTime = now.getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt || endsAt <= currentTime) {
    return null;
  }

  return startsAt <= currentTime ? "live" : "upcoming";
}

export function isCampaignOfferEligible(
  offer: PromotionCampaignOfferEligibility,
  now: Date = new Date(),
): boolean {
  if (!offer.active || offer.reviewStatus !== "approved") return false;

  if (offer.kind === "voucher") {
    if (offer.vendorReviewStatus !== "approved"
      || !offer.claimable
      || !["online", "both"].includes(offer.redemptionMode)) return false;
    const claimFrom = offer.claimFrom === null ? null : Date.parse(offer.claimFrom);
    const claimUntil = offer.claimUntil === null ? null : Date.parse(offer.claimUntil);
    const validFrom = offer.validFrom === null ? null : Date.parse(offer.validFrom);
    const validUntil = offer.validUntil === null ? null : Date.parse(offer.validUntil);
    if (claimFrom !== null && (!Number.isFinite(claimFrom) || claimFrom > now.getTime())) return false;
    if (claimUntil !== null && (!Number.isFinite(claimUntil) || claimUntil < now.getTime())) return false;
    if (validFrom !== null && (!Number.isFinite(validFrom) || validFrom > now.getTime())) return false;
    if (validUntil !== null && (!Number.isFinite(validUntil) || validUntil < now.getTime())) return false;
    return offer.maxUses === null || offer.usesCount + offer.reservedUses < offer.maxUses;
  }

  return offer.outletOfferStatus === "active"
    && offer.vendorStatus === "approved"
    && offer.outletActive
    && offer.outletReviewStatus === "approved"
    && offer.selectedOutletId === offer.actualOutletId;
}

export function filterEligibleCampaignOffers<Offer extends PromotionCampaignOfferEligibility>(
  offers: readonly Offer[],
  now: Date = new Date(),
): Offer[] {
  return offers.filter((offer) => isCampaignOfferEligible(offer, now));
}

export function selectFeaturedCampaign<Campaign extends PromotionCampaignSelection>(
  campaigns: readonly Campaign[],
  now: Date = new Date(),
): Campaign | null {
  const candidates = campaigns
    .map((campaign) => {
      const visibility = getCampaignVisibility(campaign, now);
      const eligibilityAt = visibility === "upcoming" ? new Date(campaign.startsAt) : now;
      return { campaign, visibility, offers: filterEligibleCampaignOffers(campaign.offers, eligibilityAt) };
    })
    .filter((entry) => entry.visibility !== null && entry.offers.length > 0);

  const live = candidates
    .filter((entry) => entry.visibility === "live")
    .sort((a, b) => Date.parse(a.campaign.endsAt) - Date.parse(b.campaign.endsAt));
  if (live[0]) return { ...live[0].campaign, offers: live[0].offers } as Campaign;

  const upcoming = candidates
    .filter((entry) => entry.visibility === "upcoming")
    .sort((a, b) => Date.parse(a.campaign.startsAt) - Date.parse(b.campaign.startsAt));
  return upcoming[0] ? { ...upcoming[0].campaign, offers: upcoming[0].offers } as Campaign : null;
}

/** Selects from the database's already-eligible public projection without trusting a stale visibility label. */
export function selectFeaturedPublicCampaign(
  campaigns: readonly PromotionCampaignPublic[],
  now: Date = new Date(),
): PromotionCampaignPublic | null {
  const visible = campaigns.filter((campaign) => {
    const startsAt = Date.parse(campaign.startsAt);
    const endsAt = Date.parse(campaign.endsAt);
    return Number.isFinite(startsAt)
      && Number.isFinite(endsAt)
      && startsAt < endsAt
      && endsAt > now.getTime()
      && campaign.offers.length > 0;
  });
  const live = visible
    .filter((campaign) => Date.parse(campaign.startsAt) <= now.getTime())
    .sort((left, right) => Date.parse(left.endsAt) - Date.parse(right.endsAt));
  if (live[0]) return live[0];
  return visible
    .filter((campaign) => Date.parse(campaign.startsAt) > now.getTime())
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))[0] ?? null;
}
