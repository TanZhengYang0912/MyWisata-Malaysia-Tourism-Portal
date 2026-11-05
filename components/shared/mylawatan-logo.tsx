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
  // Master logo natural dimensions: 758 x 306 (ratio ~2.477:1)
  const renderedHeight = height ?? markSize;
  const renderedWidth = width ?? Math.round(renderedHeight * (758 / 306));

  return (
    <span
      aria-label={LOGO_BRAND_NAME}
      className={`inline-flex shrink-0 items-center gap-4 ${className ?? ""}`}
      data-brand-logo="mylawatan"
      role="img"
    >
      <Image
        src="/branding/mylawatan-logo-transparent.png?v=3"
        alt={LOGO_BRAND_NAME}
        width={758}
        height={306}
        priority={priority}
        className="block h-auto w-auto max-w-full object-contain"
        style={{ height: `${renderedHeight}px`, width: `${renderedWidth}px` }}
      />
    </span>
  );
}
