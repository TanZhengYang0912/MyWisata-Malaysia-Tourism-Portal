// P4 — Member 4: shared Open Graph metadata builder for activity/product
// pages. Used by both app/customer/activity/[id]/page.tsx and
// app/guest/activity/[id]/page.tsx so the two sets of tags can't drift.
//
// Reads via the service-role client, not the cookie-aware one — same reason
// as lib/affiliate/product-names.ts::resolveProductNames(): a product
// referred through a share/affiliate link may since have been re-edited by
// its vendor and flipped back to review_status = 'pending_review'
// (products_public_read, 013_content_review_workflow.sql, requires
// status='active' AND review_status='approved' for a non-owner). An
// already-circulating link should still unfurl with a real preview instead
// of going blank, even though the page body itself (fetched separately, via
// the cookie-aware client) still correctly 404s a stranger who wasn't
// referred to it.

import type { Metadata } from 'next';
import { createServiceClient } from '@/lib/supabase/service';
import { productImageUrl } from '@/lib/storage/product-image';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function buildActivityMetadata(productId: string, path: string): Promise<Metadata> {
  const service = createServiceClient();
  const { data: product } = await service
    .from('products')
    .select('name,description,cover_url')
    .eq('id', productId)
    .maybeSingle();

  if (!product) return {};

  const description = product.description ?? undefined;

  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      images: productImageUrl(product.cover_url) ? [{ url: productImageUrl(product.cover_url)! }] : undefined,
      url: `${SITE_URL}${path}`,
    },
  };
}
