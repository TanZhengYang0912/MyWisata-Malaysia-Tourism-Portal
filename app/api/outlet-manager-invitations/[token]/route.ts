import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import { hashInvitationToken } from "@/lib/vendor/outlet-manager-invitation";

interface Props { params: Promise<{ token: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { token } = await params;
  const db = createServiceClient();
  const { data, error } = await db
    .from("outlet_manager_invitations")
    .select("id,invited_email,status,expires_at,vendors(name),outlets(name,city,state)")
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();

  if (error) return apiFail("DB_ERROR", error.message, 500);
  if (!data) return apiFail("NOT_FOUND", "Invitation not found", 404);

  const expired = data.status === "pending" && new Date(data.expires_at).getTime() <= Date.now();
  const vendor = Array.isArray(data.vendors) ? data.vendors[0] : data.vendors;
  const outlet = Array.isArray(data.outlets) ? data.outlets[0] : data.outlets;
  return apiOk({
    id: data.id,
    email: data.invited_email,
    status: expired ? "expired" : data.status,
    expiresAt: data.expires_at,
    vendorName: vendor?.name ?? "MyWisata vendor",
    outletName: outlet?.name ?? "MyWisata outlet",
    city: outlet?.city ?? null,
    state: outlet?.state ?? null,
  });
}

export async function POST(request: Request, { params }: Props) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in or register with the invited email first", 401);

  const { data, error } = await supabase.rpc("accept_outlet_manager_invitation", {
    p_token_hash: hashInvitationToken(token),
  });
  if (error) {
    const messages: Record<string, { code: string; message: string; status: number }> = {
      invalid_invitation: { code: "INVALID_INVITATION", message: "This invitation is invalid or no longer available", status: 404 },
      invitation_not_pending: { code: "INVITATION_USED", message: "This invitation has already been used or revoked", status: 409 },
      invitation_expired: { code: "INVITATION_EXPIRED", message: "This invitation has expired", status: 410 },
      email_mismatch: { code: "EMAIL_MISMATCH", message: "Sign in with the email address that received this invitation", status: 403 },
      manager_already_assigned: { code: "MANAGER_ALREADY_ASSIGNED", message: "This account is already assigned to an outlet", status: 409 },
      outlet_already_assigned: { code: "OUTLET_ALREADY_ASSIGNED", message: "This outlet already has an Outlet Manager", status: 409 },
      vendor_or_outlet_unavailable: { code: "OUTLET_UNAVAILABLE", message: "This vendor or outlet is no longer available", status: 409 },
    };
    const match = Object.entries(messages).find(([key]) => error.message.includes(key))?.[1];
    return apiFail(match?.code ?? "DB_ERROR", match?.message ?? error.message, match?.status ?? 500);
  }

  return apiOk({ accepted: true, ...(data as Record<string, unknown>) });
}
