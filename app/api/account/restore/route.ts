import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: tier, error } = await supabase.rpc("restore_my_account");
  if (error) {
    if (error.message.includes("account_suspended")) return NextResponse.json({ error: "This account is suspended and cannot be restored. Contact support for help." }, { status: 403 });
    if (error.message.includes("account_not_deleted")) return NextResponse.json({ error: "This account is already active." }, { status: 409 });
    return NextResponse.json({ error: "We could not restore your account right now. Please try again later." }, { status: 500 });
  }
  return NextResponse.json({ data: { restored: true, tier } });
}
