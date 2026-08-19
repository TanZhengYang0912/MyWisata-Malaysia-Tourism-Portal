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
const CURATED_VENDOR_IMAGE_PATH = /^(?:\/assets\/customer\/)?vendor-images\/[^/]+\.(?:avif|gif|jpe?g|png|webp)$/i;
const VERIFIED_PENANG_VENDOR_IMAGE_PATH = /^(?:\/assets\/customer\/)?penang\/(?:cheong-fatt-tze-mansion|eastern-oriental-hotel|kek-lok-si-temple|khoo-kongsi|penang-hill|pinang-peranakan-mansion)\.webp$/;

function trustedVendorMedia(url?: string | null) {
  const normalized = url?.trim() || null;
  return normalized && (
    VENDOR_UPLOAD_PATH.test(normalized) ||
    CURATED_VENDOR_IMAGE_PATH.test(normalized) ||
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
