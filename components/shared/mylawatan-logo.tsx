import Image from "next/image";
import { LOGO_BRAND_NAME } from "@/lib/i18n/invariant-tokens";

export type MyLawatanMarkProps = {
  size?: number;
  className?: string;
  title?: string;
};

export type MyLawatanLogoProps = {
  markSize?: number;
  width?: number;
  height?: number;
  className?: string;
  wordmarkClassName?: string;
  priority?: boolean;
};

export function MyLawatanMark({ size = 32, className, title }: MyLawatanMarkProps) {
  return (
    <Image
      src="/branding/mylawatan-mark-transparent.png"
      alt={title ?? LOGO_BRAND_NAME}
      width={279}
      height={230}
      className={`block shrink-0 object-contain ${className ?? ""}`}
      style={{ height: `${size}px`, width: "auto", maxWidth: "100%" }}
    />
  );
}

export function MyLawatanLogo({
  markSize = 36,
  width,
  height,
  className,
  priority = false,
}: MyLawatanLogoProps) {
  // Two artworks, both cropped tight: the horizontal lockup (1880 x 271, ~6.94:1) from `sm` up, and the
  // stacked two-line lockup (1009 x 331, ~3.05:1) on phones, where the horizontal one would be unreadably small.
  // `markSize` is the target height; each image only sets its width and scales down to fit a narrower slot.
  const renderedHeight = height ?? markSize;
  const wideWidth = width ?? Math.round(renderedHeight * (1880 / 271));
  const stackedWidth = width ?? Math.round(renderedHeight * (1009 / 331));

  return (
    <span
      aria-label={LOGO_BRAND_NAME}
      className={`inline-flex min-w-0 max-w-full shrink items-center gap-4 ${className ?? ""}`}
      data-brand-logo="mylawatan"
      role="img"
    >
      <Image
        src="/branding/mylawatan-logo-stacked.png?v=1"
        alt={LOGO_BRAND_NAME}
        width={1009}
        height={331}
        priority={priority}
        className="block h-auto max-w-full sm:hidden"
        style={{ width: `${stackedWidth}px` }}
      />
      <Image
        src="/branding/mylawatan-logo-transparent.png?v=7"
        alt={LOGO_BRAND_NAME}
        width={1880}
        height={271}
        priority={priority}
        className="hidden h-auto max-w-full sm:block"
        style={{ width: `${wideWidth}px` }}
      />
    </span>
  );
}
