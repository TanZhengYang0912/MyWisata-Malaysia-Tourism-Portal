import { z } from "zod";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

const savedDestinationSchema = z.object({
  destinationState: z.string().trim().min(1).max(80),
}).strict();

function isKnownDestination(state: string) {
  return MALAYSIA_DESTINATIONS.some((destination) => destination.state === state);
}

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const { data, error } = await supabase
    .from("customer_saved_destinations")
    .select("destination_state,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return apiFail("DB_ERROR", error.message, 500);
  return apiOk({ destinations: (data ?? []).map((row) => ({ state: row.destination_state, savedAt: row.created_at })) });
}

export async function POST(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, savedDestinationSchema);
  if (!parsed.ok) return parsed.response;
  const { destinationState } = parsed.data;
  if (!isKnownDestination(destinationState)) return apiFail("INVALID_DESTINATION", "Choose a destination from the Malaysia atlas", 400);

  const { data, error } = await supabase
    .from("customer_saved_destinations")
    .upsert({ user_id: user.id, destination_state: destinationState }, { onConflict: "user_id,destination_state", ignoreDuplicates: true })
    .select("destination_state,created_at")
    .maybeSingle();

  if (error) return apiFail("DB_ERROR", error.message, 500);
  return apiOk({ state: data?.destination_state ?? destinationState, savedAt: data?.created_at ?? new Date().toISOString(), saved: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, savedDestinationSchema);
  if (!parsed.ok) return parsed.response;
  const { destinationState } = parsed.data;
  if (!isKnownDestination(destinationState)) return apiFail("INVALID_DESTINATION", "Choose a destination from the Malaysia atlas", 400);

  const { error } = await supabase
    .from("customer_saved_destinations")
    .delete()
    .eq("user_id", user.id)
    .eq("destination_state", destinationState);

  if (error) return apiFail("DB_ERROR", error.message, 500);
  return apiOk({ state: destinationState, saved: false });
}
