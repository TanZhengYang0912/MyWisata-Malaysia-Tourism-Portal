'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  GripVertical,
  Maximize2,
  Trash2,
} from 'lucide-react';
import { OutletBlockRenderer, OutletHeroRenderer } from '@/components/outlet/outlet-block-renderer';
import ProductMediaUploader from '@/components/vendor/product-media-uploader';
import type { OutletRendererOutlet, OutletRendererProduct } from '@/components/outlet/outlet-block-types';
import {
  getBuilderViewportConfig,
  type BuilderViewport,
} from '@/components/vendor/outlet-builder-ui';
import {
  GRID_COLS,
  GRID_ROW_PX,
  GRID_SIZE_PRESETS,
  cellFromPointer,
  fits,
  gridRowCount,
  readingOrder,
} from '@/lib/vendor/outlet-grid';
import { canResizeBlockTo } from '@/lib/vendor/outlet-page-schema';
import type { OutletPageBlock, OutletPageDocument, OutletPageBlockType } from '@/lib/vendor/outlet-page-schema';
import { useTranslation } from 'react-i18next';

interface Props {
  vendorId: string;
  document: OutletPageDocument;
  outlet: OutletRendererOutlet;
  products: OutletRendererProduct[];
  view: BuilderViewport;
  selectedBlockId: string | null;
  onSelect: (blockId: string) => void;
  onInsert: (type: OutletPageBlockType, position?: { x: number; y: number }) => void;
  onPlace: (blockId: string, x: number, y: number) => void;
  onResize: (blockId: string, w: number, h: number) => void;
  onDelete: (blockId: string) => void;
  onDuplicate: (blockId: string) => void;
  onEditHero: (updates: Record<string, unknown>) => void;
  onEditBlock: (blockId: string, updates: Partial<OutletPageBlock>) => void;
  onEndInlineEdit: () => void;
}

export default function OutletBuilderCanvas({
  vendorId,
  document,
  outlet,
  products,
  view,
  selectedBlockId,
  onSelect,
  onInsert,
  onPlace,
  onResize,
  onDelete,
  onDuplicate,
  onEditHero,
  onEditBlock,
  onEndInlineEdit,
}: Props) {
  const { t } = useTranslation('vendor');
  const viewport = getBuilderViewportConfig(view);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number; ok: boolean } | null>(null);
  const [sizeMenuId, setSizeMenuId] = useState<string | null>(null);

  const rows = gridRowCount(document.blocks);

  useEffect(() => {
    if (!selectedBlockId || selectedBlockId === document.hero.id) return;
    blockRefs.current[selectedBlockId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [document.hero.id, selectedBlockId]);

  function handleGridDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!gridRef.current) return;
    event.preventDefault();
    const dragged = dragId ? document.blocks.find((block) => block.id === dragId) : null;
    // A palette drag has no readable payload yet — preview a provisional tile.
    const [w, h] = dragged ? [dragged.w, dragged.h] : [4, 2];
    const { x, y } = cellFromPointer(gridRef.current, event.clientX, event.clientY, GRID_ROW_PX, GRID_COLS, rows, w, h);
    setGhost({ x, y, w, h, ok: fits(document.blocks, { x, y, w, h }, GRID_COLS, rows, dragId || undefined) });
  }

  function handleGridDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const type = event.dataTransfer.getData('outlet-block-type') as OutletPageBlockType;
    if (ghost?.ok) {
      if (dragId) onPlace(dragId, ghost.x, ghost.y);
      else if (type) onInsert(type, { x: ghost.x, y: ghost.y });
    }
    setDragId(null);
    setGhost(null);
  }

  return (
    <div className="min-h-full bg-[#eef2f7] p-4 sm:p-7">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">{t('builder.canvasTitle')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('builder.canvasHint')}</p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-primary shadow-sm">
            {t('builder.sectionCount', { count: document.blocks.length + 1 })}
          </span>
        </div>

        <div className="overflow-x-auto pb-8">
          <div
            className={`mx-auto ${viewport.canvasClassName} ${viewport.frameClassName}`}
            style={{ fontFamily: document.fontFamily }}
          >
            <div>
              <OutletHeroRenderer
                hero={document.hero}
                brandColour={document.brandColour}
                outlet={outlet}
                mode="editor"
                selected={selectedBlockId === document.hero.id}
                onSelect={onSelect}
                onEditHero={(updates) => {
                  onSelect(document.hero.id);
                  onEditHero(updates);
                }}
                onEditEnd={onEndInlineEdit}
              />
              {selectedBlockId === document.hero.id && (
                <div
                  className="border-x border-b border-primary/10 bg-white px-4 py-3"
                  onClick={(event) => event.stopPropagation()}
                >
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary/70">
                    {t('builder.quickHeroUpload')}
                  </p>
                  <ProductMediaUploader
                    vendorId={vendorId}
                    value={document.hero.imageUrl}
                    onUploaded={(media) => onEditHero({ imageUrl: media.url })}
                  />
                </div>
              )}
            </div>
            {view === 'desktop' ? (
              <div
                ref={gridRef}
                className="relative"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${rows}, ${GRID_ROW_PX}px)`,
                  gap: 0,
                  backgroundImage: 'linear-gradient(to right, rgba(1,0,102,.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(1,0,102,.08) 1px, transparent 1px)',
                  backgroundSize: `calc(100% / ${GRID_COLS}) ${GRID_ROW_PX}px`,
                }}
                onDragOver={handleGridDragOver}
                onDrop={handleGridDrop}
              >
                {ghost && <div
                  className={`pointer-events-none z-30 m-1 rounded-xl border-2 border-dashed ${ghost.ok ? 'border-amber-400 bg-amber-100/40' : 'border-red-400 bg-red-100/40'}`}
                  style={{ gridColumn: `${ghost.x + 1} / span ${ghost.w}`, gridRow: `${ghost.y + 1} / span ${ghost.h}` }}
                />}
                {document.blocks.map((block) => {
                  const selected = selectedBlockId === block.id;
                  const blockLabel = block.title || block.type.replace('_', ' ');
                  return <div
                    key={block.id}
                    ref={(element) => { blockRefs.current[block.id] = element; }}
                    className={`group relative z-10 m-1 min-h-0 rounded-[18px] transition ${sizeMenuId === block.id ? 'z-40' : selected ? 'z-20 ring-2 ring-amber-400' : ''} ${dragId === block.id ? 'opacity-30' : ''}`}
                    style={{ gridColumn: `${block.x + 1} / span ${block.w}`, gridRow: `${block.y + 1} / span ${block.h}` }}
                  >
                    <div
                      className={`absolute right-2 top-2 z-30 flex items-center gap-1 rounded-xl border border-primary/10 bg-white/95 p-1 text-gray-500 shadow-lg backdrop-blur transition ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('outlet-block-id', block.id);
                          setDragId(block.id);
                        }}
                        onDragEnd={() => { setDragId(null); setGhost(null); }}
                        className="flex h-8 cursor-grab items-center gap-1 rounded-lg px-2 text-[10px] font-semibold text-primary/70 hover:bg-secondary active:cursor-grabbing"
                        aria-label={`Drag ${blockLabel}`}
                        title={`Drag ${blockLabel}`}
                      >
                        <GripVertical size={15} />
                      </div>
                      <button type="button" onClick={() => setSizeMenuId((current) => (current === block.id ? null : block.id))} className="inline-flex h-8 items-center rounded-lg px-2 hover:bg-secondary" aria-label={`Resize ${blockLabel}`} title="Resize"><Maximize2 size={14} /></button>
                      <button type="button" onClick={() => onDuplicate(block.id)} className="inline-flex h-8 items-center rounded-lg px-2 hover:bg-secondary" aria-label={`Duplicate ${blockLabel}`} title="Duplicate"><Copy size={14} /></button>
                      <button type="button" onClick={() => onDelete(block.id)} className="inline-flex h-8 items-center rounded-lg px-2 text-red-600 hover:bg-red-50" aria-label={`Delete ${blockLabel}`} title="Delete"><Trash2 size={14} /></button>
                    </div>

                    {sizeMenuId === block.id && <>
                      <div className="fixed inset-0 z-30" onClick={() => setSizeMenuId(null)} />
                      <div className="absolute right-2 top-12 z-40 rounded-xl border border-primary/10 bg-white p-1.5 shadow-lg" onClick={(event) => event.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-1">
                          {GRID_SIZE_PRESETS.map(([w, h]) => {
                            const active = block.w === w && block.h === h;
                            const allowed = canResizeBlockTo(document.blocks, block, w, h);
                            return <button
                              key={`${w}x${h}`}
                              type="button"
                              disabled={!allowed}
                              onClick={() => { onResize(block.id, w, h); setSizeMenuId(null); }}
                              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${active ? 'bg-primary text-white' : allowed ? 'text-gray-700 hover:bg-secondary' : 'cursor-not-allowed text-gray-300'}`}
                            >{w}×{h}</button>;
                          })}
                        </div>
                      </div>
                    </>}

                    <div className="h-full min-h-0 overflow-hidden">
                      <OutletBlockRenderer
                        block={block}
                        outlet={outlet}
                        products={products}
                        gallery={document.gallery}
                        featuredIds={document.featuredIds}
                        w={block.w}
                        h={block.h}
                        mode="editor"
                        selected={selected}
                        onSelect={onSelect}
                        onEditBlock={(updates) => { onSelect(block.id); onEditBlock(block.id, updates); }}
                        onEditEnd={onEndInlineEdit}
                      />
                    </div>
                  </div>;
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-4">
                {readingOrder(document.blocks).map((block) => {
                  const selected = selectedBlockId === block.id;
                  const blockLabel = block.title || block.type.replace('_', ' ');
                  return <div
                    key={block.id}
                    className={`group relative rounded-[18px] transition ${sizeMenuId === block.id ? 'z-40' : selected ? 'z-20 ring-2 ring-amber-400' : ''}`}
                  >
                    <div
                      className={`absolute right-2 top-2 z-30 flex items-center gap-1 rounded-xl border border-primary/10 bg-white/95 p-1 text-gray-500 shadow-lg backdrop-blur transition ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button type="button" onClick={() => setSizeMenuId((current) => (current === block.id ? null : block.id))} className="inline-flex h-8 items-center rounded-lg px-2 hover:bg-secondary" aria-label={`Resize ${blockLabel}`} title="Resize"><Maximize2 size={14} /></button>
                      <button type="button" onClick={() => onDuplicate(block.id)} className="inline-flex h-8 items-center rounded-lg px-2 hover:bg-secondary" aria-label={`Duplicate ${blockLabel}`} title="Duplicate"><Copy size={14} /></button>
                      <button type="button" onClick={() => onDelete(block.id)} className="inline-flex h-8 items-center rounded-lg px-2 text-red-600 hover:bg-red-50" aria-label={`Delete ${blockLabel}`} title="Delete"><Trash2 size={14} /></button>
                    </div>

                    {sizeMenuId === block.id && <>
                      <div className="fixed inset-0 z-30" onClick={() => setSizeMenuId(null)} />
                      <div className="absolute right-2 top-12 z-40 rounded-xl border border-primary/10 bg-white p-1.5 shadow-lg" onClick={(event) => event.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-1">
                          {GRID_SIZE_PRESETS.map(([w, h]) => {
                            const active = block.w === w && block.h === h;
                            const allowed = canResizeBlockTo(document.blocks, block, w, h);
                            return <button
                              key={`${w}x${h}`}
                              type="button"
                              disabled={!allowed}
                              onClick={() => { onResize(block.id, w, h); setSizeMenuId(null); }}
                              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${active ? 'bg-primary text-white' : allowed ? 'text-gray-700 hover:bg-secondary' : 'cursor-not-allowed text-gray-300'}`}
                            >{w}×{h}</button>;
                          })}
                        </div>
                      </div>
                    </>}

                    <OutletBlockRenderer
                      block={block}
                      outlet={outlet}
                      products={products}
                      gallery={document.gallery}
                      featuredIds={document.featuredIds}
                      w={block.w}
                      h={block.h}
                      mode="editor"
                      selected={selected}
                      onSelect={onSelect}
                      onEditBlock={(updates) => { onSelect(block.id); onEditBlock(block.id, updates); }}
                      onEditEnd={onEndInlineEdit}
                    />
                  </div>;
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
