import type { GalleryItem, OutletPageBlock, OutletPageDocument } from '@/lib/vendor/outlet-page-schema';
import type { RoomDetails } from '@/lib/customer/room-details';
import type { ReviewRatingBucket, ScopedReviewItem } from '@/backend/domains/vendor-reviews';

export interface OutletRendererOutlet {
  id: string;
  name: string;
  vendorId?: string | null;
  vendorName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  operating_hours?: unknown;
  wheelchair_accessible?: boolean | null;
  pet_friendly?: boolean | null;
  badgeSlugs?: string[];
  accommodationTypeSlugs?: string[];
  logoUrl?: string | null;
  stay?: {
    checkIn: string;
    checkOut: string;
    nights: number;
    rooms: number;
    adults: number;
    checkInTime: string | null;
    checkOutTime: string | null;
    policies: string | null;
    about: string | null;
    amenities: { code: string; label: string; icon: string }[];
    /** Review-weighted average of the hotel's room ratings; 0 when there are no reviews. */
    rating: number;
    reviews: number;
  };
}

export interface OutletRendererProduct {
  id: string;
  name: string;
  description?: string | null;
  base_price: number;
  category?: string | null;
  product_type?: string | null;
  requires_booking?: boolean;
  cover_url?: string | null;
  outlet_id?: string | null;
  variant_id?: string | null;
  variant_label?: string | null;
  first_available_slot_id?: string | null;
  available_stock?: number | null;
  rating?: number;
  reviews?: number;
  featured?: boolean;
  stay?: {
    /** Per-room price for every night of the searched stay. */
    total: number;
    /** Rooms free on the fullest night; 0 when any night is unavailable. */
    left: number;
    checkInSlotId: string | null;
    /** Room-type details for the hotel page popup; empty when the room has no data. */
    details: RoomDetails;
    /** Cover photo first, then extra room photos. */
    photos: string[];
  };
}

export interface OutletPageRendererProps {
  document: OutletPageDocument;
  outlet: OutletRendererOutlet;
  products?: OutletRendererProduct[];
  reviews?: ScopedReviewItem[];
  reviewRatingBuckets?: ReviewRatingBucket[];
  reviewTotal?: number;
  mode?: 'editor' | 'public';
  selectedBlockId?: string | null;
  onSelect?: (blockId: string) => void;
}

export type { GalleryItem, OutletPageBlock, OutletPageDocument };
