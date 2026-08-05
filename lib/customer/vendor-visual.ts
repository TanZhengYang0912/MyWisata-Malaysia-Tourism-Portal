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

function trustedVendorMedia(url?: string | null) {
  const normalized = url?.trim() || null;
  return normalized && VENDOR_UPLOAD_PATH.test(normalized) ? normalized : null;
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
    coverUrl: trustedVendorMedia(coverUrl),
    logoUrl: trustedVendorMedia(logoUrl),
    initials: initials || "MW",
  };
}
