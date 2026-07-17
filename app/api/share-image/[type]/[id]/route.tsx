// P4 — Member 4: Auto-generated social share image (§12.2.3)
// GET /api/share-image/[type]/[id] -> a branded 1080x1080 PNG card for
// Instagram/Facebook/stories. This is NOT the OG preview tags (those
// already exist — app/customer/activity/[id]/page.tsx's generateMetadata)
// — this is a downloadable/shareable image FILE, a different thing.
//
// Caching: Cache-Control headers only, no Supabase Storage bucket (decided
// against storage — next/og is fast enough at demo scale and a bucket adds
// invalidation/cleanup complexity that isn't needed here).
//
// Rating: products/vendors have no stored rating column. The real rating
// is derived from `reviews` (is_visible = true), same source
// backend/domains/review-metrics.ts::aggregateReviewMetrics() already uses
// for products. A listing with zero visible reviews shows no star line at
// all — never a fabricated/hardcoded number.

import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { apiFail } from '@/lib/validation/schemas';
import { aggregateReviewMetrics } from '@/backend/domains/review-metrics';
import { toRM } from '@/lib/money';
import { selectPublicDocument } from '@/lib/vendor/outlet-page-persistence';

export const runtime = 'edge';

const SIZE = { width: 1080, height: 1080 };

const BRAND = {
  navy: '#010066',
  yellow: '#ffcc00',
  red: '#cc0001',
  cream: '#f8fafc',
};

type ShareType = 'product' | 'vendor' | 'outlet';

interface CardData {
  name: string;
  coverUrl: string | null;
  priceLabel: string | null;
  rating: number | null;
  reviewCount: number;
}

async function ratingFromRows(rows: Array<{ rating: number }>): Promise<{ rating: number | null; reviewCount: number }> {
  if (rows.length === 0) return { rating: null, reviewCount: 0 };
  const rating = Math.round((rows.reduce((sum, r) => sum + Number(r.rating), 0) / rows.length) * 10) / 10;
  return { rating, reviewCount: rows.length };
}

async function loadListing(type: ShareType, id: string): Promise<CardData | null> {
  const supabase = await createClient();

  if (type === 'product') {
    const { data: product } = await supabase
      .from('products')
      .select('name, cover_url, base_price')
      .eq('id', id)
      .maybeSingle();
    if (!product) return null;

    const { data: reviewRows } = await supabase
      .from('reviews')
      .select('product_id, rating')
      .eq('product_id', id)
      .eq('is_visible', true);
    const metrics = aggregateReviewMetrics((reviewRows ?? []).map((r) => ({ product_id: id, rating: r.rating })));
    const metric = metrics.get(id);

    return {
      name: product.name,
      coverUrl: product.cover_url,
      priceLabel: product.base_price != null ? toRM(Number(product.base_price)) : null,
      rating: metric && metric.reviews > 0 ? metric.rating : null,
      reviewCount: metric?.reviews ?? 0,
    };
  }

  if (type === 'vendor') {
    const { data: vendor } = await supabase.from('vendors').select('name, cover_url').eq('id', id).maybeSingle();
    if (!vendor) return null;

    const { data: reviewRows } = await supabase.from('reviews').select('rating').eq('vendor_id', id).eq('is_visible', true);
    const { rating, reviewCount } = await ratingFromRows(reviewRows ?? []);

    return { name: vendor.name, coverUrl: vendor.cover_url, priceLabel: null, rating, reviewCount };
  }

  // 'outlet' — outlets ARE the public storefront in this app (no separate
  // vendor page). The outlet's own real hero photo lives in the outlet-page
  // builder's document (public_outlet_pages.hero.imageUrl), not a plain
  // column — outlets has none. Reusing selectPublicDocument() here is the
  // same accessor app/customer/outlet/[outletId]/page.tsx already calls, so
  // this never re-derives the hero shape independently.
  const { data: outlet } = await supabase.from('outlets').select('name').eq('id', id).maybeSingle();
  if (!outlet) return null;

  const { data: page } = await supabase.from('public_outlet_pages').select('*').eq('outlet_id', id).maybeSingle();
  const document = selectPublicDocument(page || {});

  const { data: reviewRows } = await supabase.from('reviews').select('rating').eq('outlet_id', id).eq('is_visible', true);
  const { rating, reviewCount } = await ratingFromRows(reviewRows ?? []);

  return { name: outlet.name, coverUrl: document.hero.imageUrl ?? null, priceLabel: null, rating, reviewCount };
}

// Google Fonts serves woff2 by default; ImageResponse needs ttf/otf/woff.
// Spoofing an old Chrome UA forces the CSS2 API to hand back a ttf src —
// the standard workaround for using real Google Fonts with satori/next-og.
const LEGACY_UA = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.115 Safari/537.36';

let fontCache: Promise<[ArrayBuffer, ArrayBuffer, ArrayBuffer]> | null = null;

async function loadFontFile(family: string, weight: number): Promise<ArrayBuffer> {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&display=swap`, {
    headers: { 'User-Agent': LEGACY_UA },
  }).then((r) => r.text());
  const match = css.match(/src: url\(([^)]+)\)/);
  if (!match) throw new Error(`font css fetch failed for ${family}@${weight}`);
  const res = await fetch(match[1]);
  return res.arrayBuffer();
}

function loadFonts() {
  fontCache ??= Promise.all([
    loadFontFile('Fraunces', 600),
    loadFontFile('Plus Jakarta Sans', 500),
    loadFontFile('IBM Plex Mono', 600),
  ]);
  return fontCache;
}

export async function GET(_request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await context.params;
  if (type !== 'product' && type !== 'vendor' && type !== 'outlet') {
    return apiFail('INVALID_TYPE', "type must be 'product', 'vendor', or 'outlet'", 400);
  }

  const listing = await loadListing(type, id);
  if (!listing) return apiFail('NOT_FOUND', 'Listing not found', 404);

  const [fraunces, jakarta, mono] = await loadFonts();

  const image = new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: BRAND.cream,
          fontFamily: '"Plus Jakarta Sans"',
          fontWeight: 500,
        }}
      >
        {listing.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.coverUrl}
            width={SIZE.width}
            height={648}
            style={{ width: '100%', height: 648, objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: 648,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: BRAND.navy,
              padding: '0 80px',
              textAlign: 'center',
            }}
          >
            <span style={{ fontFamily: '"Fraunces"', fontWeight: 600, fontSize: 64, color: BRAND.cream, lineHeight: 1.2 }}>
              {listing.name}
            </span>
          </div>
        )}

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '48px 64px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontFamily: '"Fraunces"',
                fontWeight: 600,
                fontSize: 52,
                color: BRAND.navy,
                lineHeight: 1.15,
                display: '-webkit-box',
              }}
            >
              {listing.name}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', marginTop: 24, gap: 20 }}>
              {listing.rating !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <svg width={34} height={34} viewBox="0 0 24 24" style={{ display: 'flex' }}>
                    <path
                      d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7-5.4-4.7 7.1-.6z"
                      fill={BRAND.yellow}
                    />
                  </svg>
                  <span style={{ fontFamily: '"IBM Plex Mono"', fontWeight: 600, fontSize: 32, color: BRAND.navy }}>
                    {listing.rating.toFixed(1)}
                  </span>
                </div>
              )}
              {listing.priceLabel && (
                <span style={{ fontFamily: '"IBM Plex Mono"', fontWeight: 600, fontSize: 32, color: BRAND.navy }}>
                  {listing.priceLabel}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <span style={{ fontFamily: '"Fraunces"', fontWeight: 600, fontSize: 30, color: BRAND.navy }}>MyWisata</span>
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      fonts: [
        { name: 'Fraunces', data: fraunces, weight: 600, style: 'normal' },
        { name: 'Plus Jakarta Sans', data: jakarta, weight: 500, style: 'normal' },
        { name: 'IBM Plex Mono', data: mono, weight: 600, style: 'normal' },
      ],
    }
  );

  const headers = new Headers(image.headers);
  headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  return new Response(image.body, { status: image.status, headers });
}
