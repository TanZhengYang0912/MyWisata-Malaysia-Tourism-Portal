import { vendorImageUrl } from "../storage/vendor-image";

export type VendorVisualInput = {
  name: string;
  coverUrl?: string | null;
  logoUrl?: string | null;
};

export type VendorVisual = {
  coverUrl: string | null;
  logoUrl: string | null;
  initials: string;
};

const VENDOR_UPLOAD_PATH = /\/storage\/v1\/object\/public\/vendor-products\/[^/]+\/.+/;
const CURATED_VENDOR_IMAGE_PATH = /^(?:\/assets\/customer\/)?vendor-images\/[^/]+(?:\/[^/]+)?\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const MANIFEST_VENDOR_IMAGE_PATH = /^curated-v\d+\/(?:vendor|outlet)\/(?:[^/]+\/){1,2}(?:cover|logo|gallery-\d+)\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const ENTITY_VENDOR_IMAGE_PATH = /^entities\/(?:vendor|outlet)\/[^/]+\/(?:logo|gallery-\d+)\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const ENTITY_VENDOR_IMAGE_PUBLIC_URL = /\/storage\/v1\/object\/public\/vendor-images\/entities\/(?:vendor|outlet)\/[^/]+\/(?:logo|gallery-\d+)\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i;
const VERIFIED_PENANG_VENDOR_IMAGE_PATH = /^(?:\/assets\/customer\/)?penang\/(?:cheong-fatt-tze-mansion|eastern-oriental-hotel|kek-lok-si-temple|khoo-kongsi|penang-hill|pinang-peranakan-mansion)\.webp$/;

function trustedVendorMedia(url?: string | null) {
  const normalized = url?.trim() || null;
  return normalized && (
    VENDOR_UPLOAD_PATH.test(normalized) ||
    CURATED_VENDOR_IMAGE_PATH.test(normalized) ||
    MANIFEST_VENDOR_IMAGE_PATH.test(normalized) ||
    ENTITY_VENDOR_IMAGE_PATH.test(normalized) ||
    ENTITY_VENDOR_IMAGE_PUBLIC_URL.test(normalized) ||
    VERIFIED_PENANG_VENDOR_IMAGE_PATH.test(normalized)
  ) ? normalized : null;
}

export function getVendorVisual({ name, coverUrl, logoUrl }: VendorVisualInput): VendorVisual {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return {
    coverUrl: vendorImageUrl(trustedVendorMedia(coverUrl)),
    logoUrl: vendorImageUrl(trustedVendorMedia(logoUrl)),
    initials: initials || "MW",
  };
}
