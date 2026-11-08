import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { appendCustomerQuery } from "@/lib/customer/navigation-context";
export const dynamic = "force-dynamic";
export default async function LegacyOutletPage({ params, searchParams }: { params: Promise<{ vendorId: string; outletId: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { vendorId, outletId } = await params;
  const db = await createClient();
  const { data } = await db.from("outlets").select("id").eq("id", outletId).eq("vendor_id", vendorId).eq("status", "active").eq("review_status", "approved").maybeSingle();
  if (!data) notFound();
  permanentRedirect(appendCustomerQuery(`/customer/outlets/${encodeURIComponent(outletId)}`, await searchParams));
}
