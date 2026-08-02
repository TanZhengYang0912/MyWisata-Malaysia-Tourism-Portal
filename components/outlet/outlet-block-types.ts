import type { GalleryItem, OutletPageBlock, OutletPageDocument } from '@/lib/vendor/outlet-page-schema';

export interface OutletRendererOutlet {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  operating_hours?: unknown;
}

export interface OutletRendererProduct {
  id: string;
  name: string;
  description?: string | null;
  base_price: number;
  requires_booking?: boolean;
  cover_url?: string | null;
}

export interface OutletPageRendererProps {
  document: OutletPageDocument;
  outlet: OutletRendererOutlet;
  products?: OutletRendererProduct[];
  mode?: 'editor' | 'public';
  selectedBlockId?: string | null;
  onSelect?: (blockId: string) => void;
}

export type { GalleryItem, OutletPageBlock, OutletPageDocument };
