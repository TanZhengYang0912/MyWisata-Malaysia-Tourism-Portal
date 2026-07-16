import type { OutletPageRendererProps } from '@/components/outlet/outlet-block-types';
import { OutletBlockRenderer, OutletHeroRenderer } from '@/components/outlet/outlet-block-renderer';

export function OutletPageRenderer({ document, outlet, products = [], mode = 'public', selectedBlockId, onSelect }: OutletPageRendererProps) {
  return <div style={{ fontFamily: document.fontFamily }}>
    <OutletHeroRenderer hero={document.hero} brandColour={document.brandColour} outlet={outlet} mode={mode} selected={selectedBlockId === document.hero.id} onSelect={onSelect} />
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="space-y-6">
        {document.blocks.map((block) => <OutletBlockRenderer key={block.id} block={block} outlet={outlet} products={products} gallery={document.gallery} featuredIds={document.featuredIds} mode={mode} selected={selectedBlockId === block.id} onSelect={onSelect} />)}
      </div>
    </div>
  </div>;
}
