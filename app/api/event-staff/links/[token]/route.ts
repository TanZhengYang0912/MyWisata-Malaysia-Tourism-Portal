import { resolveActiveStaffLink } from "@/lib/events/event-staff";
import { createServiceClient } from "@/lib/supabase/service";
import { apiFail, apiOk } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ token: string }> }

/** Public: what a staff join link is for. Every failure is the same 404 so the link can't be probed. */
export async function GET(_request: Request, { params }: Props) {
  const { token } = await params;
  const { link, error } = await resolveActiveStaffLink(createServiceClient(), token);
  if (error) return apiFail("DB_ERROR", "Unable to load this link", 500);
  if (!link) return apiFail("LINK_INVALID", "This link is invalid or has expired", 404);
  return apiOk({ vendorName: link.vendorName, campaignTitle: link.campaignTitle, expiresAt: link.expiresAt });
}
