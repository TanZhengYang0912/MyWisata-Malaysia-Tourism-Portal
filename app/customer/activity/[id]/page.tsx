// P4 — Member 4: Open Graph tags for the activity page (Step 3).
// This page had no metadata export before — the whole thing was a Client
// Component (see activity-detail-client.tsx), and generateMetadata() can only
// be exported from a Server Component. Split into this thin server wrapper +
// the pre-existing client component so shared links preview properly
// (WhatsApp, etc.) without touching how the page fetches its own data.

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ActivityDetailClient } from "./activity-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("name,description,cover_url")
    .eq("id", id)
    .maybeSingle();

  if (!product) return {};

  const description = product.description ?? undefined;

  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      images: product.cover_url ? [{ url: product.cover_url }] : undefined,
    },
  };
}

export default function ActivityDetailPage() {
  return <ActivityDetailClient />;
}
