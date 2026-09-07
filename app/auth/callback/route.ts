import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { pickDemoRole, type DemoRoleAssignment } from "@/lib/auth/demo-user-role";
import { postLoginDestination } from "@/lib/auth/post-login-destination";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=oauth`, url.origin));
    }
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.redirect(new URL(`/login?error=oauth`, url.origin));
  }

  const { data: roleRows, error: roleError } = await supabase.rpc("get_my_roles");
  if (roleError) {
    return NextResponse.redirect(new URL("/", url.origin));
  }

  const assignments = (roleRows ?? []).map((row: { role_name?: string | null }) => ({
    roles: { name: row.role_name },
  }));
  if (assignments.length === 0) {
    const parsedNext = next ? new URL(next, "https://mywisata.invalid") : null;
    const invitationDestination = parsedNext?.pathname.startsWith("/staff-invitations/")
      ? `${parsedNext.pathname}${parsedNext.search}${parsedNext.hash}`
      : "/";
    return NextResponse.redirect(new URL(invitationDestination, url.origin));
  }
  const role = pickDemoRole((assignments ?? []) as DemoRoleAssignment[]);
  return NextResponse.redirect(new URL(postLoginDestination(role, next), url.origin));
}
