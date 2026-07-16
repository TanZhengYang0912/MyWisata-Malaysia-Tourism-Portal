import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID",
);

export const userManagementActionSchema = z.object({
  userId: postgresUuid,
  action: z.enum(["clear_bio_restriction", "suspend", "unsuspend", "soft_delete", "restore"]),
  reason: z.string().trim().min(10, "Reason must be at least 10 characters").max(1000),
});

export type UserManagementActionInput = z.infer<typeof userManagementActionSchema>;
