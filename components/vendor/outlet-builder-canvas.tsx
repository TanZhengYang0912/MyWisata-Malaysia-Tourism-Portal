'use client';

import { useEffect, useRef } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  Trash2,
} from 'lucide-react';
import { OutletBlockRenderer, OutletHeroRenderer } from '@/components/outlet/outlet-block-renderer';
import ProductMediaUploader from '@/components/vendor/product-media-uploader';
import type { OutletRendererOutlet, OutletRendererProduct } from '@/components/outlet/outlet-block-types';
import {
  getBlockActionState,
  getBlockMoveTargetIndex,
  getBuilderViewportConfig,
  type BuilderViewport,
} from '@/components/vendor/outlet-builder-ui';
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
  onInsert: (type: OutletPageBlockType, index: number) => void;
  onMove: (blockId: string, targetIndex: number) => void;
  onDelete: (blockId: string) => void;
  onDuplicate: (blockId: string) => void;
  onEditHero: (updates: Record<string, unknown>) => void;
  onEditBlock: (blockId: string, updates: Partial<OutletPageBlock>) => void;
  onEndInlineEdit: () => void;
}

function DropZone({
  index,
  onDrop,
  label,
}: {
  index: number;
  onDrop: (event: React.DragEvent<HTMLDivElement>, index: number) => void;
  label: string;
}) {
  return (
    <div
      className="group h-5 rounded-lg"
      onDragOver={(event) => {
        event.preventDefault();
        event.currentTarget.classList.add('bg-amber-100');
      }}
      onDragLeave={(event) => event.currentTarget.classList.remove('bg-amber-100')}
      onDrop={(event) => {
        event.preventDefault();
        event.currentTarget.classList.remove('bg-amber-100');
        onDrop(event, index);
      }}
      role="button"
      tabIndex={0}
      aria-label={`${label} ${index + 1}`}
    >
      <div className="mx-auto mt-2 h-1 w-14 rounded-full bg-transparent transition group-hover:w-28 group-hover:bg-amber-400" />
    </div>
  );
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
  onMove,
  onDelete,
  onDuplicate,
  onEditHero,
  onEditBlock,
  onEndInlineEdit,
}: Props) {
  const { t } = useTranslation('vendor');
  const viewport = getBuilderViewportConfig(view);
  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!selectedBlockId || selectedBlockId === document.hero.id) return;
    blockRefs.current[selectedBlockId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [document.hero.id, selectedBlockId]);

  function handleDrop(event: React.DragEvent<HTMLDivElement>, index: number) {
    const blockId = event.dataTransfer.getData('outlet-block-id');
    const type = event.dataTransfer.getData('outlet-block-type') as OutletPageBlockType;
    if (blockId) onMove(blockId, index);
    else if (type) onInsert(type, index);
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
            <div className="space-y-1 p-4">
              <DropZone index={0} onDrop={handleDrop} label={t('builder.dropSection')} />
              {document.blocks.map((block, index) => {
                const selected = selectedBlockId === block.id;
                const { canMoveUp, canMoveDown } = getBlockActionState(index, document.blocks.length);
                const blockLabel = block.title || t(`builder.blockTypes.${block.type}`, { defaultValue: block.type.replace('_', ' ') });
                return (
                  <div
                    key={block.id}
                    ref={(element) => {
                      blockRefs.current[block.id] = element;
                    }}
                    className={`group relative rounded-[18px] transition ${selected ? 'z-10 ring-2 ring-amber-400 ring-offset-2' : ''}`}
                  >
                    <div
                      className={`absolute right-3 top-3 z-20 flex items-center gap-1 rounded-xl border border-primary/10 bg-white/95 p-1 text-gray-500 shadow-lg backdrop-blur transition ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('outlet-block-id', block.id);
                        }}
                        className="flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold text-primary/70 hover:bg-secondary"
                        aria-label={t('builder.dragBlock', { label: blockLabel })}
                        title={t('builder.dragBlock', { label: blockLabel })}
                      >
                        <GripVertical size={15} />
                        <span className="hidden md:inline">{t('builder.drag')}</span>
                      </div>
                      <span className="h-5 w-px bg-gray-200" aria-hidden="true" />
                      <button
                        type="button"
                        disabled={!canMoveUp}
                        onClick={() => onMove(block.id, getBlockMoveTargetIndex(index, 'up'))}
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={t('builder.moveUpLabel', { label: blockLabel })}
                        title={t('builder.moveUp')}
                      >
                        <ArrowUp size={14} /> <span className="hidden md:inline">{t('builder.up')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={!canMoveDown}
                        onClick={() => onMove(block.id, getBlockMoveTargetIndex(index, 'down'))}
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={t('builder.moveDownLabel', { label: blockLabel })}
                        title={t('builder.moveDown')}
                      >
                        <ArrowDown size={14} /> <span className="hidden md:inline">{t('builder.down')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicate(block.id)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold hover:bg-secondary"
                        aria-label={t('builder.duplicateLabel', { label: blockLabel })}
                        title={t('builder.duplicate')}
                      >
                        <Copy size={14} /> <span className="hidden md:inline">{t('builder.copy')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(block.id)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold text-red-600 hover:bg-red-50"
                        aria-label={t('builder.deleteLabel', { label: blockLabel })}
                        title={t('builder.delete')}
                      >
                        <Trash2 size={14} /> <span className="hidden md:inline">{t('builder.delete')}</span>
                      </button>
                    </div>
                    <OutletBlockRenderer
                      block={block}
                      outlet={outlet}
                      products={products}
                      gallery={document.gallery}
                      featuredIds={document.featuredIds}
                      mode="editor"
                      selected={selected}
                      onSelect={onSelect}
                      onEditBlock={(updates) => {
                        onSelect(block.id);
                      onEditBlock(block.id, updates);
                      }}
                      onEditEnd={onEndInlineEdit}
                    />
                    {selected && ['image', 'image_text'].includes(block.type) && (
                      <div
                        className="mt-2 rounded-2xl border border-dashed border-primary/15 bg-white p-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary/70">
                          {t('builder.quickImageUpload')}
                        </p>
                        <ProductMediaUploader
                          vendorId={vendorId}
                          value={block.imageUrl || block.image}
                          onUploaded={(media) =>
                            onEditBlock(block.id, {
                              imageUrl: media.url,
                              image: media.url,
                            })
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <DropZone index={document.blocks.length} onDrop={handleDrop} label={t('builder.dropSection')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
