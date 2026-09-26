import { z } from "zod";
import { databaseUuidSchema } from "@/lib/validation/schemas";
import { PROMOTION_CAMPAIGN_STATUSES } from "./types";

export const campaignSlugSchema = z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const campaignOfferSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("voucher"),
    voucherId: databaseUuidSchema,
    position: z.number().int().min(0).max(99),
  }).strict(),
  z.object({
    kind: z.literal("product"),
    productId: databaseUuidSchema,
    outletId: databaseUuidSchema,
    position: z.number().int().min(0).max(99),
  }).strict(),
]);

const campaignFieldsSchema = z.object({
  title: z.string().trim().min(3).max(120),
  slug: campaignSlugSchema,
  summary: z.string().trim().min(10).max(240),
  description: z.string().trim().min(10).max(5000),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  offers: z.array(campaignOfferSchema).max(24),
}).strict();

function validateCampaignDates(
  value: { startsAt: string; endsAt: string },
  context: z.RefinementCtx,
) {
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after start" });
  }
}

function validateOfferPositions(
  offers: Array<{ position: number }>,
  context: z.RefinementCtx,
) {
  const positions = new Set<number>();
  offers.forEach((offer, index) => {
    if (positions.has(offer.position)) {
      context.addIssue({ code: "custom", path: ["offers", index, "position"], message: "Offer positions must be unique" });
    }
    positions.add(offer.position);
  });
}

export const campaignCreateSchema = campaignFieldsSchema.superRefine((value, context) => {
  validateCampaignDates(value, context);
  validateOfferPositions(value.offers, context);
});

export const campaignTransitionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "pause", "resume", "archive"]),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  note: z.string().trim().min(10).max(500).optional(),
}).strict().superRefine((value, context) => {
  if (value.action === "reject" && !value.note) {
    context.addIssue({ code: "custom", path: ["note"], message: "A rejection reason is required" });
  }
});

export const campaignDraftUpdateSchema = campaignFieldsSchema.extend({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  validateCampaignDates(value, context);
  validateOfferPositions(value.offers, context);
});

export const campaignStatusSchema = z.enum(PROMOTION_CAMPAIGN_STATUSES);

export const campaignAdminPatchSchema = z.union([
  z.object({ action: z.literal("save_draft"), campaign: campaignDraftUpdateSchema }).strict(),
  campaignTransitionSchema,
]);
