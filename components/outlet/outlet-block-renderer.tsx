import Link from 'next/link';
import { ImageIcon } from 'lucide-react';
import type { GalleryItem, HeroBlock, OutletPageBlock } from '@/lib/vendor/outlet-page-schema';
import type { OutletRendererOutlet, OutletRendererProduct } from '@/components/outlet/outlet-block-types';
import { getPublicOutletEmptyState } from '@/lib/customer/outlet-shop';
import { productImageUrl } from '@/lib/storage/product-image';
import { density } from '@/lib/vendor/outlet-grid';

export interface BlockRenderModel {
  id: string;
  type: string;
  label: string;
  title: string;
  body: string;
  imageUrl?: string;
  cta?: string;
  buttonLink?: string;
}

const labels: Record<string, string> = {
  intro: 'Outlet introduction',
  text: 'Text',
  image: 'Photo',
  image_text: 'Photo',
  product_grid: 'Product grid',
  gallery: 'Gallery',
  hours: 'Opening hours',
  contact: 'Map and contact',
  voucher_banner: 'Voucher',
  cta: 'Booking call-to-action',
  review_highlight: 'Guest review',
  social_proof: 'Social proof',
  hero: 'Hero banner',
};

type RenderableBlock = {
  id: string;
  type: string;
  title?: string;
  body?: string;
  image?: string;
  imageUrl?: string;
  cta?: string;
  buttonLink?: string;
};

export function getBlockRenderModel(block: RenderableBlock): BlockRenderModel {
  return {
    id: block.id,
    type: block.type,
    label: labels[block.type] || block.type,
    title: block.title || 'Discover this outlet',
    body: block.body || '',
    imageUrl: block.imageUrl || block.image || undefined,
    cta: block.cta,
    buttonLink: block.buttonLink,
  };
}

export function formatHours(hours: unknown) {
  if (!hours || typeof hours !== 'object') return 'Check the outlet schedule before booking.';
  const entries = Object.entries(hours as Record<string, unknown>).filter(([, value]) => value && typeof value === 'object');
  if (!entries.length) return 'Check the outlet schedule before booking.';
  return entries.map(([day, value]) => {
    const schedule = value as { open?: string; close?: string; closed?: boolean };
    return `${day.slice(0, 3).toUpperCase()}: ${schedule.closed ? 'Closed' : `${schedule.open || '—'}–${schedule.close || '—'}`}`;
  }).join(' · ');
}

function outletAddress(outlet: OutletRendererOutlet) {
  return outlet.address || [outlet.city, outlet.state].filter(Boolean).join(', ') || 'Malaysia';
}

/**
 * Live outlet data, unless this block overrides it. An override key that is
 * absent — or present but empty — means "use the outlet's own data".
 */
export function resolveBlockContent(
  block: OutletPageBlock | { overrides?: { hours?: string; address?: string; phone?: string; review?: string } },
  outlet: OutletRendererOutlet,
) {
  const overrides = block.overrides || {};
  return {
    hours: overrides.hours || formatHours(outlet.operating_hours),
    address: overrides.address || outletAddress(outlet),
    phone: overrides.phone || outlet.phone || '',
    review: overrides.review || 'Verified guests recommend this outlet.',
  };
}

interface Props {
  block: OutletPageBlock | { id: string; type: 'hero'; title: string; body: string; imageUrl?: string; cta?: string; buttonLink?: string };
  outlet: OutletRendererOutlet;
  products?: OutletRendererProduct[];
  gallery?: GalleryItem[];
  featuredIds?: string[];
  w?: number;
  h?: number;
  mode?: 'editor' | 'public';
  selected?: boolean;
  onSelect?: (blockId: string) => void;
  onEditBlock?: (updates: Partial<OutletPageBlock>) => void;
  onEditEnd?: () => void;
}

interface HeroProps {
  hero: HeroBlock;
  outlet: OutletRendererOutlet;
  brandColour?: string;
  mode?: 'editor' | 'public';
  selected?: boolean;
  onSelect?: (blockId: string) => void;
  onEditHero?: (updates: Record<string, unknown>) => void;
  onEditEnd?: () => void;
}

export function OutletHeroRenderer({ hero, brandColour = '#00004D', mode = 'public', selected = false, onSelect, onEditHero, onEditEnd }: HeroProps) {
  const heroStyle = hero.imageUrl ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,77,.82), rgba(0,0,77,.2)), url(${hero.imageUrl})`, backgroundSize: 'cover', backgroundPosition: hero.imagePosition || 'center' } : undefined;
  const section = <section className={`relative overflow-hidden ${selected ? 'ring-4 ring-amber-300' : ''}`} style={{ backgroundColor: brandColour, ...heroStyle }}>
    <div className="relative mx-auto max-w-7xl px-6 py-24 text-white" style={{ textAlign: hero.textAlign || 'left' }}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">Verified MyWisata outlet</p>
      {mode === 'editor' && onEditHero ? (
        <input
          aria-label="Edit hero title"
          value={hero.title}
          onChange={(event) => onEditHero({ title: event.target.value })}
          onBlur={onEditEnd}
          onClick={(event) => event.stopPropagation()}
          className="mt-3 block w-full max-w-3xl rounded-lg border border-white/30 bg-black/10 px-2 py-1 text-4xl font-black tracking-tight text-white outline-none ring-amber-300 placeholder:text-white/60 focus:ring-2 sm:text-6xl"
        />
      ) : (
        <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">{hero.title}</h1>
      )}
      {mode === 'editor' && onEditHero ? (
        <textarea
          aria-label="Edit hero supporting copy"
          value={hero.body}
          onChange={(event) => onEditHero({ body: event.target.value })}
          onBlur={onEditEnd}
          onClick={(event) => event.stopPropagation()}
          rows={2}
          className="mt-4 block w-full max-w-2xl rounded-lg border border-white/25 bg-black/10 px-2 py-1 text-sm text-white outline-none ring-amber-300 placeholder:text-white/60 focus:ring-2"
        />
      ) : (
        hero.body && <p className="mt-4 max-w-2xl text-sm opacity-90">{hero.body}</p>
      )}
    </div>
  </section>;
  if (mode !== 'editor') return section;
  return <div role="button" tabIndex={0} aria-label="Edit Hero banner" onClick={() => onSelect?.(hero.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect?.(hero.id); }}>{section}</div>;
}

export function OutletBlockRenderer({ block, outlet, products = [], gallery = [], featuredIds = [], w = 4, h = 2, mode = 'public', selected = false, onSelect, onEditBlock, onEditEnd }: Props) {
  const model = getBlockRenderModel(block);
  const tile = density(w, h);
  // The hero variant of this union carries no overrides — pass an empty block.
  const live = resolveBlockContent('overrides' in block ? block : {}, outlet);
  const editable = mode === 'editor' && Boolean(onEditBlock);
  const isPhoto = block.type === 'image' || block.type === 'image_text';
  const isPhotoStory = block.type === 'image_text';
  const blockStyle = 'style' in block ? block.style : undefined;
  const productIds = block.type === 'product_grid' && block.productIds?.length ? block.productIds : featuredIds;
  const visibleProducts = products.filter((product) => !productIds.length || productIds.includes(product.id));
  const wrapperClass = `rounded-2xl border bg-white p-6 shadow-sm ${selected ? 'border-amber-500 ring-2 ring-amber-200' : 'border-primary/10'}`;
  if (mode === 'public' && block.type === 'product_grid') return null;
  const content = (
    <>
      {(!isPhoto || isPhotoStory) && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{model.label}</p>}
      {(!isPhoto || isPhotoStory) && editable ? (
        <input
          aria-label={`Edit ${model.label} title`}
          value={model.title}
          onChange={(event) => onEditBlock?.({ title: event.target.value })}
          onBlur={onEditEnd}
          onClick={(event) => event.stopPropagation()}
          className="mt-2 block w-full rounded-lg border border-primary/10 bg-white px-2 py-1 text-xl font-bold outline-none ring-amber-300 focus:ring-2"
        />
      ) : (!isPhoto || isPhotoStory) ? (
        <h2 className="mt-2 text-xl font-bold">{model.title}</h2>
      ) : null}
      {(!isPhoto || isPhotoStory) && editable ? (
        <textarea
          aria-label={`Edit ${model.label} supporting copy`}
          value={model.body}
          onChange={(event) => onEditBlock?.({ body: event.target.value })}
          onBlur={onEditEnd}
          onClick={(event) => event.stopPropagation()}
          rows={2}
          placeholder="Add supporting copy"
          className="mt-2 block w-full rounded-lg border border-primary/10 bg-white px-2 py-1 text-sm leading-6 text-slate-600 outline-none ring-amber-300 focus:ring-2"
        />
      ) : (!isPhoto || isPhotoStory) ? (
        model.body && <p className="mt-2 text-sm leading-6 text-slate-600">{model.body}</p>
      ) : null}
      {model.imageUrl && block.type !== 'hero' && <img src={model.imageUrl} alt={model.title} className="mt-4 h-40 w-full rounded-xl object-cover" />}
      {mode === 'editor' && !model.imageUrl && ['image', 'image_text'].includes(block.type) && <div className="mt-4 flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-primary/15 bg-secondary/40 text-xs font-semibold text-gray-400">Drop image here</div>}
      {editable && ['image', 'image_text'].includes(block.type) && <input aria-label={`Edit ${model.label} image URL`} value={model.imageUrl || ''} onChange={(event) => onEditBlock?.({ imageUrl: event.target.value, image: event.target.value })} onBlur={onEditEnd} onClick={(event) => event.stopPropagation()} placeholder="Paste image URL" className="mt-2 block h-9 w-full rounded-lg border border-primary/10 bg-white px-2 text-xs outline-none ring-amber-300 focus:ring-2" />}
      {mode === 'public' && !model.imageUrl && isPhoto && <div className="mt-4 flex h-40 flex-col items-center justify-center rounded-xl border border-primary/10 bg-secondary/50 px-4 text-center text-sm text-slate-500"><ImageIcon size={24} className="mb-2 text-primary/50" /><p className="font-semibold">{getPublicOutletEmptyState('gallery').title}</p><p className="mt-1 text-xs">{getPublicOutletEmptyState('gallery').body}</p></div>}
      {block.type === 'gallery' && (gallery.length > 0 ? <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${tile.columns}, minmax(0, 1fr))` }}>{gallery.slice(0, tile.items).map((item) => <img key={item.url} src={item.url} alt={item.alt || `${outlet.name} gallery`} className="aspect-[4/3] w-full rounded-xl object-cover" />)}</div> : mode === 'public' ? <div className="mt-4 flex items-center gap-3 rounded-xl border border-primary/10 bg-secondary/50 px-4 py-4 text-sm text-slate-600"><ImageIcon size={22} className="shrink-0 text-primary/60" /><div><p className="font-semibold">{getPublicOutletEmptyState('gallery').title}</p><p className="mt-1 text-xs">{getPublicOutletEmptyState('gallery').body}</p></div></div> : null)}
      {block.type === 'product_grid' && (visibleProducts.length > 0 ? <div id="featured-products" className="mt-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${tile.columns}, minmax(0, 1fr))` }}>{visibleProducts.slice(0, tile.items).map((product) => <Link key={product.id} href={`/customer/activity/${product.id}`} className="group overflow-hidden rounded-xl border border-primary/10 bg-secondary/40 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"><div className="h-36 bg-secondary">{product.cover_url ? <img src={productImageUrl(product.cover_url) || ''} alt={product.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-xs font-semibold text-slate-400">Experience photo coming soon</div>}</div><div className="p-4"><div className="flex items-start justify-between gap-3"><p className="font-bold">{product.name}</p><p className="shrink-0 text-sm font-bold text-primary">RM {Number(product.base_price).toFixed(2)}</p></div>{product.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{product.description}</p>}<p className="mt-3 text-xs font-semibold text-primary">{product.requires_booking ? 'Booking required' : 'Available to explore'} <span aria-hidden="true">→</span></p></div></Link>)}</div> : mode === 'public' ? <div id="featured-products" className="mt-4 rounded-xl border border-primary/10 bg-secondary/50 px-5 py-6"><p className="font-semibold">{getPublicOutletEmptyState('products').title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{getPublicOutletEmptyState('products').body}</p></div> : null)}
      {mode === 'editor' && block.type === 'product_grid' && visibleProducts.length === 0 && <div className="mt-4 rounded-xl border-2 border-dashed border-primary/15 bg-secondary/40 px-4 py-6 text-center text-xs font-semibold text-gray-400">Select products in the editor</div>}
      {block.type === 'hours' && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-slate-700">{live.hours}</p>}
      {block.type === 'contact' && <div className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm text-slate-700"><p>{live.address}</p>{live.phone && <p className="mt-1 font-semibold">{live.phone}</p>}<a className="mt-2 inline-block font-semibold text-primary hover:underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([outlet.name, outlet.address, outlet.city, outlet.state].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer">Open directions</a></div>}
      {(block.type === 'cta' || block.type === 'voucher_banner') && <Link className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90" href={model.buttonLink || '#featured-products'}>{model.cta || 'Explore this outlet'}</Link>}
      {block.type === 'review_highlight' && <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm text-slate-700">{live.review}</p>}
      {block.type === 'social_proof' && <p className="mt-4 font-semibold text-amber-600">★ Trusted by travellers across Malaysia</p>}
    </>
  );
  if (mode === 'editor') return <div role="button" tabIndex={0} className={`${wrapperClass} block w-full text-left`} onClick={() => onSelect?.(model.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect?.(model.id); }} style={blockStyle?.backgroundColor ? { backgroundColor: blockStyle.backgroundColor } : undefined}>{content}</div>;
  return <section className={wrapperClass} style={blockStyle?.backgroundColor ? { backgroundColor: blockStyle.backgroundColor } : undefined}>{content}</section>;
}
