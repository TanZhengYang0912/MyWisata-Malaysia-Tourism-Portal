import { placeImageUrl } from '@/lib/storage/place-image';

export interface ManagedPlaceImage {
  name: string;
  imageUrl: string | null;
}

interface ResolveOutletImageInput {
  outletName: string;
  outletHeroUrl?: string | null;
  managedPlaceImages: ManagedPlaceImage[];
}

function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function resolveOutletImage({ outletName, outletHeroUrl, managedPlaceImages }: ResolveOutletImageInput) {
  if (outletHeroUrl?.trim()) return outletHeroUrl;

  const normalizedOutletName = normalizedName(outletName);
  const matchingPlace = managedPlaceImages.find((place) => {
    const normalizedPlaceName = normalizedName(place.name);
    return normalizedOutletName.startsWith(normalizedPlaceName) || normalizedPlaceName.startsWith(normalizedOutletName);
  });

  return placeImageUrl(matchingPlace?.imageUrl);
}
