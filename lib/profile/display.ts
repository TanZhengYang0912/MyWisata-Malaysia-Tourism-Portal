export const PROFILE_SECTION_IDS = ["personal", "contact", "verification", "preferences", "danger"] as const;

export function canResubmitKyc(status: string): boolean {
  return status === "rejected";
}
