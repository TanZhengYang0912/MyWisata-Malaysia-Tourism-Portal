import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: tier, error } = await supabase.rpc("restore_my_account");
  if (error) {
    const status = error.message.includes("account_suspended") ? 403 : error.message.includes("account_not_deleted") ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ data: { restored: true, tier } });
}
