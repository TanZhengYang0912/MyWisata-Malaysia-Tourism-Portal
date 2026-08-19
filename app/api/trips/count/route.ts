import { getTrips } from "@/backend/domains/trips";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const db = await createClient();
    const trips = await getTrips(db);
    return NextResponse.json({ count: trips.length });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
