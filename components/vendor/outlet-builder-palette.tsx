'use client';

import { FileText, GalleryHorizontal, ImagePlus, MapPinned, MessageSquareQuote, MousePointerClick, Package, Percent, Plus, Store, Ticket, type LucideIcon } from 'lucide-react';
import type { OutletPageBlockType } from '@/lib/vendor/outlet-page-schema';

export interface BuilderPaletteItem {
  type: OutletPageBlockType;
  label: string;
  hint: string;
  icon: LucideIcon;
}

export const BUILDER_PALETTE: BuilderPaletteItem[] = [
  { type: 'text', label: 'Text', hint: 'Add a heading and story.', icon: FileText },
  { type: 'image', label: 'Image', hint: 'Show a place or detail.', icon: ImagePlus },
  { type: 'image_text', label: 'Image + text', hint: 'Pair a visual with a story.', icon: FileText },
  { type: 'product_grid', label: 'Product cards', hint: 'Feature this outlet’s listings.', icon: Package },
  { type: 'gallery', label: 'Gallery', hint: 'Show several images.', icon: GalleryHorizontal },
  { type: 'hours', label: 'Opening hours', hint: 'Use the outlet schedule.', icon: Store },
  { type: 'contact', label: 'Map and contact', hint: 'Help travellers find you.', icon: MapPinned },
  { type: 'voucher_banner', label: 'Voucher banner', hint: 'Promote an offer.', icon: Ticket },
  { type: 'review_highlight', label: 'Guest review', hint: 'Build trust with feedback.', icon: MessageSquareQuote },
  { type: 'social_proof', label: 'Social proof', hint: 'Show a trusted signal.', icon: Percent },
  { type: 'cta', label: 'Call to action', hint: 'Move guests toward booking.', icon: MousePointerClick },
];

interface Props {
  onAddBlock: (type: OutletPageBlockType) => void;
  onBeginDrag: (type: OutletPageBlockType) => void;
}

export default function OutletBuilderPalette({ onAddBlock, onBeginDrag }: Props) {
  return <aside className="border-b border-primary/10 bg-white p-4 lg:border-b-0 lg:border-r">
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Add elements</p>
    <p className="mt-1 text-xs leading-5 text-gray-500">Click to add or drag into the page.</p>
    <div className="mt-4 grid gap-2">
      {BUILDER_PALETTE.map(({ type, label, hint, icon: Icon }) => <button key={type} type="button" draggable onDragStart={(event) => { event.dataTransfer.setData('outlet-block-type', type); onBeginDrag(type); }} onClick={() => onAddBlock(type)} className="group flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-3 text-left transition hover:border-primary/30 hover:bg-secondary">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary group-hover:bg-white"><Icon size={16} /></span>
        <span className="min-w-0"><span className="block text-xs font-bold text-gray-900">{label}</span><span className="mt-0.5 block text-[10px] leading-4 text-gray-500">{hint}</span></span>
        <Plus size={14} className="ml-auto shrink-0 text-gray-300 group-hover:text-primary" />
      </button>)}
    </div>
  </aside>;
}
