'use client';

import { ChevronDown, FileText, GalleryHorizontal, ImagePlus, MapPinned, MessageSquareQuote, MousePointerClick, Package, Percent, Plus, Store, Ticket, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { OutletPageBlockType } from '@/lib/vendor/outlet-page-schema';
import { useTranslation } from 'react-i18next';

export interface BuilderPaletteItem {
  type: OutletPageBlockType;
  label: string;
  hint: string;
  icon: LucideIcon;
}

export interface BuilderPaletteGroup {
  id: string;
  label: string;
  hint: string;
  items: BuilderPaletteItem[];
  defaultOpen?: boolean;
}

export const BUILDER_PALETTE: BuilderPaletteItem[] = [
  { type: 'text', label: 'Text', hint: 'Add a heading and story.', icon: FileText },
  { type: 'image_text', label: 'Photo', hint: 'Add a photo, caption or story.', icon: ImagePlus },
  { type: 'product_grid', label: 'Product cards', hint: 'Feature this outlet’s listings.', icon: Package },
  { type: 'gallery', label: 'Gallery', hint: 'Show several images.', icon: GalleryHorizontal },
  { type: 'hours', label: 'Opening hours', hint: 'Use the outlet schedule.', icon: Store },
  { type: 'contact', label: 'Map and contact', hint: 'Help travellers find you.', icon: MapPinned },
  { type: 'voucher_banner', label: 'Voucher banner', hint: 'Promote an offer.', icon: Ticket },
  { type: 'review_highlight', label: 'Guest review', hint: 'Build trust with feedback.', icon: MessageSquareQuote },
  { type: 'social_proof', label: 'Social proof', hint: 'Show a trusted signal.', icon: Percent },
  { type: 'cta', label: 'Call to action', hint: 'Move guests toward booking.', icon: MousePointerClick },
];

export const BUILDER_PALETTE_GROUPS: BuilderPaletteGroup[] = [
  {
    id: 'common-content',
    label: 'Common content',
    hint: 'Tell your story with visuals.',
    defaultOpen: true,
    items: BUILDER_PALETTE.filter((item) => ['text', 'image_text', 'gallery'].includes(item.type)),
  },
  {
    id: 'products-sales',
    label: 'Products & sales',
    hint: 'Help guests choose and book.',
    items: BUILDER_PALETTE.filter((item) => ['product_grid', 'voucher_banner', 'cta'].includes(item.type)),
  },
  {
    id: 'outlet-information',
    label: 'Outlet information',
    hint: 'Make the visit easy to plan.',
    items: BUILDER_PALETTE.filter((item) => ['hours', 'contact'].includes(item.type)),
  },
  {
    id: 'trust-reviews',
    label: 'Trust & reviews',
    hint: 'Show why travellers can trust you.',
    items: BUILDER_PALETTE.filter((item) => ['review_highlight', 'social_proof'].includes(item.type)),
  },
];

interface Props {
  onAddBlock: (type: OutletPageBlockType) => void;
  onBeginDrag: (type: OutletPageBlockType) => void;
}

export default function OutletBuilderPalette({ onAddBlock, onBeginDrag }: Props) {
  const { t } = useTranslation('vendor');
  const groupLabel = (id: string, fallback: string) => t(`builder.palette.groups.${id}.label`);
  const groupHint = (id: string, fallback: string) => t(`builder.palette.groups.${id}.hint`);
  const itemLabel = (type: string, fallback: string) => t(`builder.palette.items.${type}.label`);
  const itemHint = (type: string, fallback: string) => t(`builder.palette.items.${type}.hint`);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(BUILDER_PALETTE_GROUPS.map((group) => [group.id, Boolean(group.defaultOpen)])),
  );

  return <aside className="border-b border-primary/10 bg-white p-4 lg:border-b-0 lg:border-r">
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t('builder.palette.title')}</p>
    <p className="mt-1 text-xs leading-5 text-gray-500">{t('builder.palette.hint')}</p>
    <div className="mt-4 space-y-3">
      {BUILDER_PALETTE_GROUPS.map((group) => {
        const isOpen = Boolean(openGroups[group.id]);
        return <section key={group.id} className="rounded-2xl border border-gray-100 bg-gray-50/60 p-2">
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => setOpenGroups((current) => ({ ...current, [group.id]: !isOpen }))}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-white"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-gray-900">{groupLabel(group.id, group.label)}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-gray-500">{groupHint(group.id, group.hint)}</span>
            </span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-gray-400">{group.items.length}</span>
            <ChevronDown size={15} className={`shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          {isOpen && <div className="mt-1 grid gap-1.5">
            {group.items.map(({ type, label, hint, icon: Icon }) => <button key={type} type="button" draggable onDragStart={(event) => { event.dataTransfer.setData('outlet-block-type', type); onBeginDrag(type); }} onClick={() => onAddBlock(type)} className="group flex items-center gap-3 rounded-xl border border-transparent bg-white px-2.5 py-2.5 text-left transition hover:border-primary/30 hover:bg-secondary">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary group-hover:bg-white"><Icon size={16} /></span>
              <span className="min-w-0"><span className="block text-xs font-bold text-gray-900">{itemLabel(type, label)}</span><span className="mt-0.5 block text-[10px] leading-4 text-gray-500">{itemHint(type, hint)}</span></span>
              <Plus size={14} className="ml-auto shrink-0 text-gray-300 group-hover:text-primary" />
            </button>)}
          </div>}
        </section>;
      })}
    </div>
  </aside>;
}
