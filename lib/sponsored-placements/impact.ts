import { z } from "zod";

const positionSchema = z.number().int().min(1).max(4);

const shiftedPlacementSchema = z.object({
  placementId: z.string().uuid(),
  productName: z.string().min(1).max(500),
  fromPosition: positionSchema,
  toPosition: positionSchema,
}).strict();

const statusChangeSchema = z.object({
  placementId: z.string().uuid(),
  productName: z.string().min(1).max(500),
  fromPosition: positionSchema,
  toStatus: z.enum(["paused", "archived"]),
}).strict();

export const sponsoredImpactPreviewSchema = z.object({
  previewVersion: z.string().regex(/^[0-9a-f]{32}$/i),
  requestedPosition: positionSchema,
  hasCollision: z.boolean(),
  shifts: z.array(shiftedPlacementSchema).max(100),
  paused: z.array(statusChangeSchema).max(100),
  archived: z.array(statusChangeSchema).max(100),
  summary: z.object({
    shiftedCount: z.number().int().nonnegative(),
    pausedCount: z.number().int().nonnegative(),
    archivedCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export type SponsoredImpactPreview = z.infer<typeof sponsoredImpactPreviewSchema>;
