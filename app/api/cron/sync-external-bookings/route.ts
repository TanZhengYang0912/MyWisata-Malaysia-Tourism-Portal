import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "External booking sync is not configured" }, { status: 503 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // No outbound partner adapter exists yet. Keep the outbox untouched and
  // retryable until a provider-specific dispatcher is configured.
  return NextResponse.json({ error: "External booking dispatcher is not configured" }, { status: 503 });
}
