import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickDemoRole } from "@/lib/auth/demo-user-role";
import { postLoginDestination } from "@/lib/auth/guest-mode";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=oauth`, url.origin));
    }
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.redirect(new URL("/login", url.origin));

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("user_roles(roles(name))")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) return NextResponse.redirect(new URL("/", url.origin));

  const role = pickDemoRole(profile.user_roles ?? []);
  const destination = postLoginDestination(url.searchParams.get("next"), role);
  return NextResponse.redirect(new URL(destination, url.origin));
}
