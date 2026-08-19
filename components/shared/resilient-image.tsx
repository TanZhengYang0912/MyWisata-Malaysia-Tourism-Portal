"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ImageOff } from "lucide-react";

export function ResilientImage({
  src,
  alt,
  className,
  fallbackClassName,
  fallbackLabel = "Image unavailable",
  style,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  fallbackLabel?: string;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const normalizedSrc = src?.trim() || null;

  useEffect(() => {
    setFailed(false);
  }, [normalizedSrc]);

  if (!normalizedSrc || failed) {
    return (
      <div
        role="img"
        aria-label={`${alt || "Listing"} image unavailable`}
        className={fallbackClassName ?? "flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-amber-50 text-primary"}
      >
        <ImageOff aria-hidden="true" />
        <span className="mt-2 text-xs font-semibold">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    // Runtime media hosts are configured by vendors and cannot be enumerated for next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={normalizedSrc}
      alt={alt}
      className={className}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
