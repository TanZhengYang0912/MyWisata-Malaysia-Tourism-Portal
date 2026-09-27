import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { pickDemoRole, type DemoRoleAssignment } from "@/lib/auth/demo-user-role";
import { postLoginDestination } from "@/lib/auth/post-login-destination";

function resolveRedirectOrigin(requestUrl: URL): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return requestUrl.origin;

  let siteUrl: URL;
  try {
    siteUrl = new URL(configured);
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a valid application origin");
  }

  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(siteUrl.hostname);
  const validProtocol = siteUrl.protocol === "https:" || (siteUrl.protocol === "http:" && isLocal);
  if (
    !validProtocol
    || siteUrl.username
    || siteUrl.password
    || siteUrl.pathname !== "/"
    || siteUrl.search
    || siteUrl.hash
  ) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a valid application origin");
  }

  return siteUrl.origin;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const redirectOrigin = resolveRedirectOrigin(requestUrl);
  const code = requestUrl.searchParams.get("code");
  const next = safeNext(requestUrl.searchParams.get("next"));
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=oauth`, redirectOrigin));
    }
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.redirect(new URL(`/login?error=oauth`, redirectOrigin));
  }

  const { data: roleRows, error: roleError } = await supabase.rpc("get_my_roles");
  if (roleError) {
    return NextResponse.redirect(new URL("/", redirectOrigin));
  }

  const assignments = (roleRows ?? []).map((row: { role_name?: string | null }) => ({
    roles: { name: row.role_name },
  }));
  if (assignments.length === 0) {
    const parsedNext = next ? new URL(next, "https://mywisata.invalid") : null;
    const invitationDestination = parsedNext?.pathname.startsWith("/staff-invitations/")
      ? `${parsedNext.pathname}${parsedNext.search}${parsedNext.hash}`
      : "/";
    return NextResponse.redirect(new URL(invitationDestination, redirectOrigin));
  }
  const role = pickDemoRole((assignments ?? []) as DemoRoleAssignment[]);
  return NextResponse.redirect(new URL(postLoginDestination(role, next), redirectOrigin));
}
