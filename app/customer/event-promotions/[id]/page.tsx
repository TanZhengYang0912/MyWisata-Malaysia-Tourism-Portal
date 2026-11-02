import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Sparkles, Store } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/service';
import { getServerTranslation } from '@/lib/i18n/server';
import { getFeaturedEventPromotions } from '@/lib/customer/event-promotions';
import { BRAND_NAME } from '@/lib/i18n/invariant-tokens';
import { LocalizedContent } from '@/components/customer/localized-content';

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ id: string }> }

// Reuses getFeaturedEventPromotions (approved + upcoming only — same as the
// rail) rather than a separate query, so a direct link to an event never shows
// something not-yet-approved or already elapsed.
async function findPromotion(id: string) {
  const promotions = await getFeaturedEventPromotions(createServiceClient(), 200);
  return promotions.find((promotion) => promotion.id === id) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const promotion = await findPromotion(id);
  if (!promotion) return { title: `${BRAND_NAME}` };
  const title = `${promotion.title} · ${BRAND_NAME}`;
  return { title, description: promotion.details.slice(0, 160), openGraph: { title, images: [promotion.posterUrl] } };
}

export default async function EventPromotionDetailPage({ params }: Props) {
  const { id } = await params;
  const { t } = await getServerTranslation('customer');
  const promotion = await findPromotion(id);
  if (!promotion) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/customer" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('ui.eventPromotions.rail.backToHome')}
      </Link>

      <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
        <Sparkles size={14} className="text-highlight-yellow" aria-hidden="true" />
        {t('ui.eventPromotions.rail.badge')}
      </p>

      <div className="mt-4 grid gap-6 md:grid-cols-[480px_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={promotion.posterUrl} alt="" className="h-72 w-full rounded-2xl border border-border object-cover md:h-full" />

        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"><LocalizedContent entityType="vendor_event_promotion" entityId={promotion.id} field="title" sourceText={promotion.title} /></h1>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Store size={15} aria-hidden="true" /> {promotion.vendorName}</span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={15} aria-hidden="true" />
              {promotion.startDate === promotion.endDate ? promotion.startDate : `${promotion.startDate} – ${promotion.endDate}`}
            </span>
          </div>

          <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground"><LocalizedContent entityType="vendor_event_promotion" entityId={promotion.id} field="details" sourceText={promotion.details} /></p>
        </div>
      </div>
    </main>
  );
}
