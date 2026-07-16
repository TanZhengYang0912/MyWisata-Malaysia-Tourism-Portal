import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { error } = await supabase.rpc("close_my_account");
  if (error) {
    const status = error.message.includes("account_suspended") ? 409 : 500;
    return NextResponse.json({ error: status === 409 ? "Suspended accounts cannot be closed here" : error.message }, { status });
  }

  await supabase.auth.signOut();
  return NextResponse.json({ data: { closed: true } });
}
