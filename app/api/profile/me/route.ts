import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mapProfileSummary, type KycReviewRow, type PreferenceRow, type ProfileRow } from "@/lib/profile/profile-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const service = createServiceClient();
  const [profileResult, preferenceResult, kycResult] = await Promise.all([
    supabase
      .from("users")
      .select("id,email,full_name,display_name,avatar_url,bio,phone,city,country,city_id,country_code,city_source,status,tier,kyc_status,email_verified_at,phone_verified_at,profile_completed_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("preference_survey_responses")
      .select("interests,travel_style,budget_range,mobility_needs,preferred_radius_km")
      .eq("user_id", user.id)
      .maybeSingle(),
    service
      .from("kyc_submissions")
      .select("status,review_reason_code,reviewed_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (profileResult.error || preferenceResult.error || kycResult.error) {
    console.error("[profile] profile summary query failed", {
      profile: Boolean(profileResult.error), preferences: Boolean(preferenceResult.error), kyc: Boolean(kycResult.error),
    });
    return NextResponse.json({ error: "Unable to load your profile right now. Please retry." }, { status: 503 });
  }
  if (!profileResult.data) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const data = mapProfileSummary(
    profileResult.data as unknown as ProfileRow,
    preferenceResult.data as PreferenceRow | null,
    (kycResult.data ?? []) as unknown as KycReviewRow[],
  );
  return NextResponse.json({ data });
}
