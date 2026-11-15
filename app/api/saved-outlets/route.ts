import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { isHotelOutlet } from "@/lib/customer/hotel-outlet";
import { getClaimsUserId } from "@/lib/auth/claims-user";

const savedOutletSchema = z.object({
  outletId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid UUID"),
}).strict();

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const supabase = await createClient();
  const userId = await getClaimsUserId(supabase);
  if (!userId) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const { data, error } = await supabase
    .from("customer_saved_outlets")
    .select("outlet_id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return apiFail("DB_ERROR", error.message, 500);
  return apiOk({ outletIds: (data ?? []).map((row) => row.outlet_id) });
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, savedOutletSchema);
  if (!parsed.ok) return parsed.response;
  const { outletId } = parsed.data;
  if (!await isHotelOutlet(supabase, outletId)) return apiFail("NOT_A_HOTEL", "Only hotels can be saved here", 422);

  const { error } = await supabase
    .from("customer_saved_outlets")
    .upsert({ user_id: user.id, outlet_id: outletId }, { onConflict: "user_id,outlet_id", ignoreDuplicates: true })
    .select("outlet_id,created_at")
    .maybeSingle();

  if (error) return apiFail("DB_ERROR", error.message, 500);
  return apiOk({ outletId, saved: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, savedOutletSchema);
  if (!parsed.ok) return parsed.response;
  const { outletId } = parsed.data;

  const { error } = await supabase
    .from("customer_saved_outlets")
    .delete()
    .eq("user_id", user.id)
    .eq("outlet_id", outletId);

  if (error) return apiFail("DB_ERROR", error.message, 500);
  return apiOk({ outletId, saved: false });
}
