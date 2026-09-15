import { z } from "zod";

const isoDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  });
const safeIdentifier = z.string().min(1).max(160)
  .regex(/^[A-Za-z0-9._:-]+$/)
  .refine((value) => !["__proto__", "prototype", "constructor"].includes(value));

export const weatherTargetSchema = z.object({
  key: safeIdentifier,
  date: isoDate,
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  label: z.string().trim().min(1).max(240),
  kind: z.enum(["day", "item"]),
  itemId: safeIdentifier,
}).strict();

export const weatherBatchRequestSchema = z.object({
  tripId: safeIdentifier,
  targets: z.array(weatherTargetSchema).min(1).max(20),
}).strict();

export const weatherOverlayRequestSchema = z.object({
  tripId: safeIdentifier,
  date: isoDate,
  hour: z.number().int().min(0).max(23),
}).strict();

export const weatherRadarRequestSchema = z.object({
  tripId: safeIdentifier,
}).strict();
