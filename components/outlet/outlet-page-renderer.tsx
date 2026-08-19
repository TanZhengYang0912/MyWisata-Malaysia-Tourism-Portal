import type React from 'react';
import type { OutletPageRendererProps } from '@/components/outlet/outlet-block-types';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Accessibility, Clock3, Mail, MapPin, Navigation, PawPrint, Phone } from 'lucide-react';
import { OutletBlockRenderer, OutletHeroRenderer, formatHours } from '@/components/outlet/outlet-block-renderer';
import { OutletMenu } from '@/components/outlet/outlet-menu';
import { readingOrder } from '@/lib/vendor/outlet-grid';

function outletAddress(outlet: OutletPageRendererProps['outlet']) {
  return outlet.address || [outlet.city, outlet.state].filter(Boolean).join(', ') || 'Malaysia';
}

function VisitSummary({ outlet }: { outlet: OutletPageRendererProps['outlet'] }) {
  const address = outletAddress(outlet);
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([outlet.name, outlet.address, outlet.city, outlet.state].filter(Boolean).join(', '))}`;

  return <section className="mb-6 rounded-2xl border border-primary/10 bg-white p-5 shadow-sm" aria-label="Plan your visit">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="grid gap-4 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-start gap-3"><MapPin size={18} className="mt-0.5 shrink-0 text-primary" /><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Location</p><p className="mt-1 font-semibold text-slate-900">{address}</p></div></div>
        <div className="flex items-start gap-3"><Clock3 size={18} className="mt-0.5 shrink-0 text-primary" /><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Hours</p><p className="mt-1 leading-5">{formatHours(outlet.operating_hours)}</p></div></div>
        <div className="flex items-start gap-3"><Phone size={18} className="mt-0.5 shrink-0 text-primary" /><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Contact</p><a href={`tel:${outlet.phone || ''}`} className="mt-1 block font-semibold text-slate-900 hover:text-primary">{outlet.phone || 'Contact via chat'}</a>{outlet.email && <a href={`mailto:${outlet.email}`} className="mt-1 block max-w-[180px] truncate text-xs hover:text-primary">{outlet.email}</a>}</div></div>
        <div className="flex items-start gap-3"><Accessibility size={18} className="mt-0.5 shrink-0 text-primary" /><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Good to know</p><p className="mt-1 leading-5">{outlet.wheelchair_accessible === true ? 'Wheelchair accessible' : 'Ask the outlet for access details'}{outlet.pet_friendly === true ? ' · Pet friendly' : ''}</p></div>{outlet.pet_friendly === true && <PawPrint size={14} className="mt-1 text-primary" aria-hidden="true" />}</div>
      </div>
      <div className="flex flex-wrap gap-2"><a href="#featured-products" className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90">View experiences</a><a href={mapHref} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/20 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-secondary"><Navigation size={15} />Get directions</a></div>
    </div>
  </section>;
}

export function OutletPageRenderer({ document, outlet, products = [], mode = 'public', selectedBlockId, onSelect }: OutletPageRendererProps) {
  return <div style={{ fontFamily: document.fontFamily }}>
    <OutletHeroRenderer hero={document.hero} brandColour={document.brandColour} outlet={outlet} mode={mode} selected={selectedBlockId === document.hero.id} onSelect={onSelect} />
    <div className="mx-auto max-w-7xl px-6 py-10">
      <VisitSummary outlet={outlet} />
      <div className="outlet-grid">
        {readingOrder(document.blocks)
          .filter((block) => !(mode === 'public' && block.type === 'product_grid'))
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
      {mode === 'public' && <div className="mt-6"><OutletMenu outlet={outlet} products={products} /></div>}
    </div>
  </div>;
}
