'use client';

import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react';
import { OutletBlockRenderer, OutletHeroRenderer } from '@/components/outlet/outlet-block-renderer';
import type { OutletRendererOutlet, OutletRendererProduct } from '@/components/outlet/outlet-block-types';
import type { OutletPageBlock, OutletPageDocument, OutletPageBlockType } from '@/lib/vendor/outlet-page-schema';

interface Props {
  document: OutletPageDocument;
  outlet: OutletRendererOutlet;
  products: OutletRendererProduct[];
  view: 'desktop' | 'mobile';
  selectedBlockId: string | null;
  onSelect: (blockId: string) => void;
  onInsert: (type: OutletPageBlockType, index: number) => void;
  onMove: (blockId: string, targetIndex: number) => void;
  onDelete: (blockId: string) => void;
}

function DropZone({ index, onDrop }: { index: number; onDrop: (event: React.DragEvent<HTMLDivElement>, index: number) => void }) {
  return <div className="group h-5 rounded-lg" onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add('bg-amber-100'); }} onDragLeave={(event) => event.currentTarget.classList.remove('bg-amber-100')} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove('bg-amber-100'); onDrop(event, index); }} role="button" tabIndex={0} aria-label={`Drop section at position ${index + 1}`}><div className="mx-auto mt-2 h-1 w-14 rounded-full bg-transparent transition group-hover:w-28 group-hover:bg-amber-400" /></div>;
}

export default function OutletBuilderCanvas({ document, outlet, products, view, selectedBlockId, onSelect, onInsert, onMove, onDelete }: Props) {
  const canvasClass = view === 'mobile' ? 'max-w-[390px]' : 'max-w-3xl';
  function handleDrop(event: React.DragEvent<HTMLDivElement>, index: number) {
    const blockId = event.dataTransfer.getData('outlet-block-id');
    const type = event.dataTransfer.getData('outlet-block-type') as OutletPageBlockType;
    if (blockId) onMove(blockId, index);
    else if (type) onInsert(type, index);
  }

  return <div className="min-h-[680px] bg-[#f8fafc] p-4 sm:p-7">
    <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Shop canvas</p><p className="mt-1 text-sm text-gray-500">Drag an element into the page, then click it to edit.</p></div><span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-primary shadow-sm">{document.blocks.length + 1} sections</span></div>
    <div className={`mx-auto overflow-hidden rounded-[24px] border border-primary/10 bg-white shadow-lg transition-all ${canvasClass}`} style={{ fontFamily: document.fontFamily }}>
      <OutletHeroRenderer hero={document.hero} brandColour={document.brandColour} outlet={outlet} mode="editor" selected={selectedBlockId === document.hero.id} onSelect={onSelect} />
      <div className="space-y-1 p-4"><DropZone index={0} onDrop={handleDrop} />{document.blocks.map((block, index) => <div key={block.id} draggable onDragStart={(event) => event.dataTransfer.setData('outlet-block-id', block.id)} className="group relative"><div className="absolute -left-1 top-3 z-10 flex -translate-x-full flex-col gap-1 opacity-0 transition group-hover:opacity-100"><button type="button" disabled={index === 0} onClick={() => onMove(block.id, index - 1)} className="rounded-md bg-white p-1 text-gray-400 shadow-sm disabled:opacity-30" aria-label={`Move ${block.title || block.type} up`}><ArrowUp size={13} /></button><button type="button" disabled={index === document.blocks.length - 1} onClick={() => onMove(block.id, index + 1)} className="rounded-md bg-white p-1 text-gray-400 shadow-sm disabled:opacity-30" aria-label={`Move ${block.title || block.type} down`}><ArrowDown size={13} /></button></div><div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg bg-white/90 px-1.5 py-1 text-gray-400 opacity-0 shadow-sm transition group-hover:opacity-100"><GripVertical size={14} /><button type="button" onClick={() => onDelete(block.id)} className="rounded p-1 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${block.title || block.type}`}><Trash2 size={13} /></button></div><OutletBlockRenderer block={block} outlet={outlet} products={products} gallery={document.gallery} featuredIds={document.featuredIds} mode="editor" selected={selectedBlockId === block.id} onSelect={onSelect} /></div>)}<DropZone index={document.blocks.length} onDrop={handleDrop} /></div>
    </div>
  </div>;
}
