"use client";

import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { OutletPageRendererProps } from '@/components/outlet/outlet-block-types';
import { Accessibility, ArrowUpRight, Clock3, MapPin, Navigation, PawPrint, Phone } from 'lucide-react';
import { OutletBlockRenderer, OutletHeroRenderer, formatHours } from '@/components/outlet/outlet-block-renderer';
import { OutletMenu } from '@/components/outlet/outlet-menu';
import { readingOrder } from '@/lib/vendor/outlet-grid';
import { MediaGallery } from '@/components/customer/media-gallery';

function outletAddress(outlet: OutletPageRendererProps['outlet']) {
  return outlet.address || [outlet.city, outlet.state].filter(Boolean).join(', ') || 'Malaysia';
}

function VisitSummary({ outlet, mode = 'public' }: { outlet: OutletPageRendererProps['outlet']; mode?: 'editor' | 'public' }) {
  const { t } = useTranslation('customer');
  const address = outletAddress(outlet);
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([outlet.name, outlet.address, outlet.city, outlet.state].filter(Boolean).join(', '))}`;

  return <section className={`relative z-10 rounded-3xl border border-border bg-card p-5 shadow-lg sm:p-6 ${mode === 'public' ? '-mt-8 mb-8' : 'mb-6'}`} aria-label={t('ui.outlet.planVisit')}>
    <div className="grid gap-5 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
      <div className="flex items-start gap-3"><MapPin size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t('ui.labels.location')}</p><p className="mt-1 font-semibold text-foreground">{address}</p></div></div>
      <div className="flex items-start gap-3"><Clock3 size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t('ui.labels.operatingHours')}</p><p className="mt-1 leading-5">{formatHours(outlet.operating_hours, { scheduleUnavailable: t('ui.outlet.scheduleBeforeBooking'), closed: t('ui.outlet.closed'), day: (day) => t(`ui.labels.days.${day.slice(0, 3).toLowerCase()}`) })}</p></div></div>
      <div className="flex items-start gap-3"><Phone size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" /><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t('ui.outlet.contact')}</p><a href={`tel:${outlet.phone || ''}`} className="mt-1 block font-semibold text-foreground hover:text-primary">{outlet.phone || t('ui.labels.contactViaChat')}</a>{outlet.email && <a href={`mailto:${outlet.email}`} className="mt-1 block break-words whitespace-normal text-xs hover:text-primary">{outlet.email}</a>}</div></div>
      <div className="flex items-start gap-3"><Accessibility size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t('ui.outlet.goodToKnow')}</p><p className="mt-1 leading-5">{outlet.wheelchair_accessible === true ? t('ui.labels.wheelchairAccessible') : t('ui.outlet.askAccessDetails')}{outlet.pet_friendly === true ? ` · ${t('ui.outlet.petFriendly')}` : ''}</p></div>{outlet.pet_friendly === true && <PawPrint size={14} className="mt-1 text-primary" aria-hidden="true" />}</div>
    </div>
    <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4"><a href="#featured-products" className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90">{t('ui.actions.viewExperiences')} <ArrowUpRight size={15} aria-hidden="true" /></a><a href={mapHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/20 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-secondary"><Navigation size={15} aria-hidden="true" />{t('ui.actions.getDirections')} <ArrowUpRight size={15} aria-hidden="true" /></a></div>
  </section>;
}

function PublicOutletTemplate({ document, outlet, products = [] }: Pick<OutletPageRendererProps, 'document' | 'outlet' | 'products'>) {
  const { t } = useTranslation('customer');
  const hero = document.hero.imageUrl || document.gallery[0]?.url
    ? { ...document.hero, imageUrl: document.hero.imageUrl || document.gallery[0]?.url }
    : document.hero;
  const publicBlocks = readingOrder(document.blocks).filter((block) => block.type !== 'product_grid' && block.type !== 'gallery');

  return <div style={{ fontFamily: document.fontFamily }}>
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-[1.75rem] border border-border bg-primary shadow-lg">
        <OutletHeroRenderer hero={hero} brandColour={document.brandColour} outlet={outlet} mode="public" />
      </div>
    </div>
    <div className="outlet-public-content mx-auto max-w-7xl px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8">
      <VisitSummary outlet={outlet} mode="public" />
      {document.gallery.length > 0 && <div className="mb-8"><MediaGallery items={document.gallery} label={t('ui.outlet.galleryLabel', { outlet: outlet.name })} previousLabel={t('ui.outlet.previousGallery')} nextLabel={t('ui.outlet.nextGallery')} slideLabel={t('ui.outlet.gallerySlide')} roleDescription={t('ui.accessibility.carousel')} /></div>}
      {publicBlocks.length > 0 && <div className="space-y-6">
        {publicBlocks.map((block) => <OutletBlockRenderer key={block.id} block={block} outlet={outlet} products={products} gallery={document.gallery} featuredIds={document.featuredIds} w={block.w} h={block.h} mode="public" />)}
      </div>}
      <div className="mt-6"><OutletMenu outlet={outlet} products={products} /></div>
    </div>
  </div>;
}

export function OutletPageRenderer({ document, outlet, products = [], mode = 'public', selectedBlockId, onSelect }: OutletPageRendererProps) {
  if (mode === 'public') return <PublicOutletTemplate document={document} outlet={outlet} products={products} />;

  return <div style={{ fontFamily: document.fontFamily }}>
    <OutletHeroRenderer hero={document.hero} brandColour={document.brandColour} outlet={outlet} mode={mode} selected={selectedBlockId === document.hero.id} onSelect={onSelect} />
    <div className="mx-auto max-w-7xl px-6 py-10">
      <VisitSummary outlet={outlet} mode="editor" />
      <div className="outlet-grid">
        {readingOrder(document.blocks)
          .map((block) => <div
            key={block.id}
            className="outlet-grid__cell"
            style={{
              '--grid-x': block.x + 1,
              '--grid-w': block.w,
              '--grid-y': block.y + 1,
              '--grid-h': block.h,
            } as React.CSSProperties}
          >
            <OutletBlockRenderer block={block} outlet={outlet} products={products} gallery={document.gallery} featuredIds={document.featuredIds} w={block.w} h={block.h} mode={mode} selected={selectedBlockId === block.id} onSelect={onSelect} />
          </div>)}
      </div>
    </div>
  </div>;
}
