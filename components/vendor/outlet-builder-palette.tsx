'use client';

import { ChevronDown, FileText, GalleryHorizontal, ImagePlus, MapPinned, MessageSquareQuote, MousePointerClick, Package, Percent, Plus, Store, Ticket, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { OutletPageBlockType } from '@/lib/vendor/outlet-page-schema';
import { useTranslation } from 'react-i18next';

export interface BuilderPaletteItem {
  type: OutletPageBlockType;
  label: string;
  icon: LucideIcon;
}

export interface BuilderPaletteGroup {
  id: string;
  label: string;
  items: BuilderPaletteItem[];
  defaultOpen?: boolean;
}

export const BUILDER_PALETTE: BuilderPaletteItem[] = [
  { type: 'text', label: 'Text', icon: FileText },
  { type: 'image_text', label: 'Photo', icon: ImagePlus },
  { type: 'product_grid', label: 'Product cards', icon: Package },
  { type: 'gallery', label: 'Gallery', icon: GalleryHorizontal },
  { type: 'hours', label: 'Opening hours', icon: Store },
  { type: 'contact', label: 'Map and contact', icon: MapPinned },
  { type: 'voucher_banner', label: 'Voucher banner', icon: Ticket },
  { type: 'review_highlight', label: 'Guest review', icon: MessageSquareQuote },
  { type: 'social_proof', label: 'Social proof', icon: Percent },
  { type: 'cta', label: 'Call to action', icon: MousePointerClick },
];

export const BUILDER_PALETTE_GROUPS: BuilderPaletteGroup[] = [
  {
    id: 'common-content',
    label: 'Common content',
    defaultOpen: true,
    items: BUILDER_PALETTE.filter((item) => ['text', 'image_text', 'gallery'].includes(item.type)),
  },
  {
    id: 'products-sales',
    label: 'Products & sales',
    items: BUILDER_PALETTE.filter((item) => ['product_grid', 'voucher_banner', 'cta'].includes(item.type)),
  },
  {
    id: 'outlet-information',
    label: 'Outlet information',
    items: BUILDER_PALETTE.filter((item) => ['hours', 'contact'].includes(item.type)),
  },
  {
    id: 'trust-reviews',
    label: 'Trust & reviews',
    items: BUILDER_PALETTE.filter((item) => ['review_highlight', 'social_proof'].includes(item.type)),
  },
];

interface Props {
  onAddBlock: (type: OutletPageBlockType) => void;
  onBeginDrag: (type: OutletPageBlockType) => void;
}

export default function OutletBuilderPalette({ onAddBlock, onBeginDrag }: Props) {
  const { t, i18n } = useTranslation('vendor');
  const translateOrFallback = (key: string, fallback: string) =>
    i18n.exists(key, { ns: 'vendor' }) ? t(key) : fallback;
  const groupLabel = (id: string, fallback: string) => translateOrFallback(`builder.palette.groups.${id}.label`, fallback);
  const itemLabel = (type: string, fallback: string) => translateOrFallback(`builder.palette.items.${type}.label`, fallback);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(BUILDER_PALETTE_GROUPS.map((group) => [group.id, Boolean(group.defaultOpen)])),
  );

  return <aside className="border-b border-primary/10 bg-card p-4 lg:border-b-0">
    {/* On lg the Studio tool drawer header already names this panel. */}
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary lg:hidden">{t('builder.palette.title')}</p>
    <p className="mt-1 text-xs leading-5 text-gray-500">{t('builder.palette.hint')}</p>
    <div className="mt-4 space-y-3">
      {BUILDER_PALETTE_GROUPS.map((group) => {
        const isOpen = Boolean(openGroups[group.id]);
        return <section key={group.id} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-2">
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => setOpenGroups((current) => ({ ...current, [group.id]: !isOpen }))}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-card"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-gray-900">{groupLabel(group.id, group.label)}</span>
            </span>
            <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-gray-400">{group.items.length}</span>
            <ChevronDown size={15} className={`shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          {isOpen && <div className="mt-1 grid gap-1.5">
            {group.items.map(({ type, label, icon: Icon }) => <button key={type} type="button" draggable onDragStart={(event) => { event.dataTransfer.setData('outlet-block-type', type); onBeginDrag(type); }} onClick={() => onAddBlock(type)} className="group flex items-center gap-3 rounded-xl border border-transparent bg-card px-2.5 py-2.5 text-left transition hover:border-primary/30 hover:bg-secondary">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary group-hover:bg-card"><Icon size={16} /></span>
              <span className="min-w-0"><span className="block text-xs font-bold text-gray-900">{itemLabel(type, label)}</span></span>
              <Plus size={14} className="ml-auto shrink-0 text-gray-300 group-hover:text-primary" />
            </button>)}
          </div>}
        </section>;
      })}
    </div>
  </aside>;
}
