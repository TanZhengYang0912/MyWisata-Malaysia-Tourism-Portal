"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { GalleryItem } from "@/lib/vendor/outlet-page-schema";

type MediaGalleryProps = {
  items: readonly GalleryItem[];
  label: string;
  previousLabel: string;
  nextLabel: string;
  slideLabel: string;
};

export function MediaGallery({ items, label, previousLabel, nextLabel, slideLabel }: MediaGalleryProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  if (!items.length) return null;

  function scrollTo(index: number) {
    const nextIndex = (index + items.length) % items.length;
    railRef.current?.children.item(nextIndex)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    setActiveIndex(nextIndex);
  }

  return (
    <section aria-roledescription={label} aria-label={label} className="relative overflow-hidden rounded-3xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div ref={railRef} className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onScroll={(event) => {
        const target = event.currentTarget;
        const first = target.firstElementChild as HTMLElement | null;
        if (first) setActiveIndex(Math.round(target.scrollLeft / Math.max(first.offsetWidth, 1)));
      }}>
        {items.map((item, index) => (
          <figure key={item.url} role="group" aria-roledescription={slideLabel} aria-label={`${slideLabel} ${index + 1} / ${items.length}`} className="relative min-w-full snap-start overflow-hidden rounded-2xl">
            {/* Runtime-configured Storage URLs are intentionally rendered as img. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt={item.alt || label} loading={index === 0 ? "eager" : "lazy"} decoding="async" className="h-[240px] w-full object-cover sm:h-[320px] lg:h-[400px]" />
          </figure>
        ))}
      </div>
      {items.length > 1 && <>
        <button type="button" aria-label={previousLabel} onClick={() => scrollTo(activeIndex - 1)} className="absolute left-6 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md transition hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"><ArrowLeft size={18} aria-hidden="true" /></button>
        <button type="button" aria-label={nextLabel} onClick={() => scrollTo(activeIndex + 1)} className="absolute right-6 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground shadow-md transition hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"><ArrowRight size={18} aria-hidden="true" /></button>
        <div className="mt-3 flex items-center justify-center gap-2" aria-live="polite">
          <span className="sr-only">{`${activeIndex + 1} / ${items.length}`}</span>
          {items.map((item, index) => <button key={item.url} type="button" aria-label={`${slideLabel} ${index + 1} / ${items.length}`} aria-current={index === activeIndex ? "true" : undefined} onClick={() => scrollTo(index)} className={`h-2 rounded-full transition-all ${index === activeIndex ? "w-6 bg-primary" : "w-2 bg-primary/25"}`} />)}
        </div>
      </>}
    </section>
  );
}
