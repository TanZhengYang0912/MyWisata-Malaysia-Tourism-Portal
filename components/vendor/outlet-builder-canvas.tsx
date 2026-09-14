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
  rectFromResizePointer,
  readingOrder,
  type ResizeHandle,
} from '@/lib/vendor/outlet-grid';
import { BLOCK_MIN_SIZE, canResizeBlockTo } from '@/lib/vendor/outlet-page-schema';
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

type PointerGesture =
  | {
      kind: 'move';
      blockId: string;
      pointerId: number;
      origin: OutletPageBlock;
      offsetX: number;
      offsetY: number;
      moved: boolean;
    }
  | {
      kind: 'resize';
      blockId: string;
      pointerId: number;
      handle: ResizeHandle;
      origin: OutletPageBlock;
      moved: boolean;
    };

type InteractionGhost = { x: number; y: number; w: number; h: number; ok: boolean };

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
  const [ghost, setGhost] = useState<InteractionGhost | null>(null);
  const [sizeMenuId, setSizeMenuId] = useState<string | null>(null);
  const [pointerInteractionId, setPointerInteractionId] = useState<string | null>(null);
  const pointerGestureRef = useRef<PointerGesture | null>(null);
  const latestGhostRef = useRef<InteractionGhost | null>(null);
  const documentRef = useRef(document);
  const onPlaceRef = useRef(onPlace);
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    documentRef.current = document;
    onPlaceRef.current = onPlace;
    onResizeRef.current = onResize;
  }, [document, onPlace, onResize]);

  const rows = gridRowCount(document.blocks);

  function isInteractiveTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest('input, textarea, button, a, select, [contenteditable="true"]'));
  }

  function clearPointerInteraction() {
    pointerGestureRef.current = null;
    latestGhostRef.current = null;
    setPointerInteractionId(null);
    setGhost(null);
  }

  function beginMove(event: React.PointerEvent<HTMLDivElement>, block: OutletPageBlock) {
    if (view !== 'desktop' || event.button !== 0 || isInteractiveTarget(event.target) || pointerGestureRef.current) return;
    const gridElement = gridRef.current;
    const blockElement = blockRefs.current[block.id];
    if (!gridElement || !blockElement) return;
    const gridRect = gridElement.getBoundingClientRect();
    const blockRect = blockElement.getBoundingClientRect();
    const colPx = gridRect.width / GRID_COLS;
    const rowPx = GRID_ROW_PX;

    event.preventDefault();
    onSelect(block.id);
    pointerGestureRef.current = {
      kind: 'move',
      blockId: block.id,
      pointerId: event.pointerId,
      origin: block,
      offsetX: Math.max(0, Math.min(block.w - 0.01, (event.clientX - blockRect.left) / colPx)),
      offsetY: Math.max(0, Math.min(block.h - 0.01, (event.clientY - blockRect.top) / rowPx)),
      moved: false,
    };
    setPointerInteractionId(block.id);
  }

  function beginResize(event: React.PointerEvent<HTMLButtonElement>, block: OutletPageBlock, handle: ResizeHandle) {
    if (view !== 'desktop' || event.button !== 0 || pointerGestureRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(block.id);
    pointerGestureRef.current = {
      kind: 'resize',
      blockId: block.id,
      pointerId: event.pointerId,
      handle,
      origin: block,
      moved: false,
    };
    setPointerInteractionId(block.id);
  }

  useEffect(() => {
    if (!pointerInteractionId) return;

    function handlePointerMove(event: PointerEvent) {
      const gesture = pointerGestureRef.current;
      const gridElement = gridRef.current;
      const currentDocument = documentRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId || !gridElement) return;

      const gridRect = gridElement.getBoundingClientRect();
      const currentBlock = currentDocument.blocks.find((block) => block.id === gesture.blockId);
      if (!currentBlock) return;
      const currentRows = gridRowCount(currentDocument.blocks);
      let nextRect: InteractionGhost;

      if (gesture.kind === 'move') {
        const colPx = gridRect.width / GRID_COLS;
        const nextX = Math.max(0, Math.min(GRID_COLS - gesture.origin.w, Math.round((event.clientX - gridRect.left) / colPx - gesture.offsetX)));
        const nextY = Math.max(0, Math.min(currentRows - gesture.origin.h, Math.round((event.clientY - gridRect.top) / GRID_ROW_PX - gesture.offsetY)));
        nextRect = {
          x: nextX,
          y: nextY,
          w: gesture.origin.w,
          h: gesture.origin.h,
          ok: fits(currentDocument.blocks, { x: nextX, y: nextY, w: gesture.origin.w, h: gesture.origin.h }, GRID_COLS, currentRows, gesture.blockId),
        };
      } else {
        const [minW, minH] = BLOCK_MIN_SIZE[currentBlock.type];
        const resized = rectFromResizePointer(
          { left: gridRect.left, top: gridRect.top, width: gridRect.width },
          event.clientX,
          event.clientY,
          gesture.origin,
          GRID_ROW_PX,
          GRID_COLS,
          gesture.handle,
          minW,
          minH,
        );
        nextRect = {
          ...resized,
          ok: canResizeBlockTo(currentDocument.blocks, currentBlock, resized.w, resized.h),
        };
      }

      if (nextRect.x === gesture.origin.x && nextRect.y === gesture.origin.y && nextRect.w === gesture.origin.w && nextRect.h === gesture.origin.h) {
        gesture.moved = false;
        latestGhostRef.current = null;
        setGhost(null);
        return;
      }
      gesture.moved = true;
      event.preventDefault();
      latestGhostRef.current = nextRect;
      setGhost(nextRect);
    }

    function finishPointerInteraction(event: PointerEvent, commit: boolean) {
      const gesture = pointerGestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const finalRect = latestGhostRef.current;
      if (commit && gesture.moved && finalRect?.ok) {
        if (gesture.kind === 'move') onPlaceRef.current(gesture.blockId, finalRect.x, finalRect.y);
        else onResizeRef.current(gesture.blockId, finalRect.w, finalRect.h);
      }
      clearPointerInteraction();
    }

    const handlePointerUp = (event: PointerEvent) => finishPointerInteraction(event, true);
    const handlePointerCancel = (event: PointerEvent) => finishPointerInteraction(event, false);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearPointerInteraction();
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pointerInteractionId]);

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
                  className={`pointer-events-none relative z-30 m-1 rounded-xl border-2 border-dashed ${ghost.ok ? 'border-amber-400 bg-amber-100/40' : 'border-red-400 bg-red-100/40'}`}
                  style={{ gridColumn: `${ghost.x + 1} / span ${ghost.w}`, gridRow: `${ghost.y + 1} / span ${ghost.h}` }}
                >
                  {pointerInteractionId && <span className={`absolute right-2 top-2 rounded-md px-2 py-1 text-[10px] font-bold shadow-sm ${ghost.ok ? 'bg-amber-400 text-primary' : 'bg-red-500 text-white'}`}>
                    {ghost.w}×{ghost.h}
                  </span>}
                </div>}
                {document.blocks.map((block) => {
                  const selected = selectedBlockId === block.id;
                  const blockLabel = block.title || t(`builder.blockTypes.${block.type}`);
                  return <div
                    key={block.id}
                    ref={(element) => { blockRefs.current[block.id] = element; }}
                    onPointerDown={(event) => beginMove(event, block)}
                    aria-grabbed={pointerInteractionId === block.id}
                    className={`group relative z-10 m-1 min-h-0 rounded-[18px] transition ${sizeMenuId === block.id ? 'z-40' : selected ? 'z-20 ring-2 ring-amber-400' : ''} ${dragId === block.id || pointerInteractionId === block.id ? 'opacity-30' : ''}`}
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
                        aria-label={t('builder.dragBlock', { label: blockLabel })}
                        title={t('builder.dragBlock', { label: blockLabel })}
                      >
                        <GripVertical size={15} />
                      </div>
                      <button type="button" onClick={() => setSizeMenuId((current) => (current === block.id ? null : block.id))} className="inline-flex h-8 items-center rounded-lg px-2 hover:bg-secondary" aria-label={t('builder.resizeLabel', { label: blockLabel })} title={t('builder.resize')}><Maximize2 size={14} /></button>
                      <button type="button" onClick={() => onDuplicate(block.id)} className="inline-flex h-8 items-center rounded-lg px-2 hover:bg-secondary" aria-label={t('builder.duplicateLabel', { label: blockLabel })} title={t('builder.duplicate')}><Copy size={14} /></button>
                      <button type="button" onClick={() => onDelete(block.id)} className="inline-flex h-8 items-center rounded-lg px-2 text-red-600 hover:bg-red-50" aria-label={t('builder.deleteLabel', { label: blockLabel })} title={t('builder.delete')}><Trash2 size={14} /></button>
                    </div>

                    {selected && <>
                      <button
                        type="button"
                        onPointerDown={(event) => beginResize(event, block, 'east')}
                        className="absolute right-[-5px] top-1/2 z-40 h-10 w-3 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white bg-amber-400 shadow-sm"
                        aria-label={t('builder.resizeWidthLabel', { label: blockLabel })}
                        title={t('builder.resizeWidth')}
                      />
                      <button
                        type="button"
                        onPointerDown={(event) => beginResize(event, block, 'south')}
                        className="absolute bottom-[-5px] left-1/2 z-40 h-3 w-10 -translate-x-1/2 cursor-ns-resize rounded-full border-2 border-white bg-amber-400 shadow-sm"
                        aria-label={t('builder.resizeHeightLabel', { label: blockLabel })}
                        title={t('builder.resizeHeight')}
                      />
                      <button
                        type="button"
                        onPointerDown={(event) => beginResize(event, block, 'south-east')}
                        className="absolute bottom-[-6px] right-[-6px] z-40 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-amber-400 shadow-sm"
                        aria-label={t('builder.resizeBothLabel', { label: blockLabel })}
                        title={t('builder.resizeBoth')}
                      />
                    </>}

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
                      <button type="button" onClick={() => setSizeMenuId((current) => (current === block.id ? null : block.id))} className="inline-flex h-8 items-center rounded-lg px-2 hover:bg-secondary" aria-label={`Resize ${blockLabel}`} title={t("builder.resize")}><Maximize2 size={14} /></button>
                      <button type="button" onClick={() => onDuplicate(block.id)} className="inline-flex h-8 items-center rounded-lg px-2 hover:bg-secondary" aria-label={`Duplicate ${blockLabel}`} title={t("builder.duplicate")}><Copy size={14} /></button>
                      <button type="button" onClick={() => onDelete(block.id)} className="inline-flex h-8 items-center rounded-lg px-2 text-red-600 hover:bg-red-50" aria-label={`Delete ${blockLabel}`} title={t("builder.delete")}><Trash2 size={14} /></button>
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
