import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { performGlobalSearch } from "@/backend/domains/search";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  
  if (q.trim().length < 2) {
    return NextResponse.json({ destinations: [], experiences: [], vendors: [] });
  }

  const db = await createClient();
  const results = await performGlobalSearch(q, db);
  
  return NextResponse.json(results);
}
