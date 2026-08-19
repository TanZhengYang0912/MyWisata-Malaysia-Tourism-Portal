"use client";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Bookmark, MapPin, X } from "lucide-react";
import { useSavedDestinations } from "@/components/providers/saved-destinations";
import type { MalaysiaDestination } from "@/lib/customer/malaysia-destinations";

export type DestinationPreviewModalProps = {
  destination: MalaysiaDestination | null;
  onClose: () => void;
  onExplore: (state: string) => void;
};

export function DestinationPreviewModal({ destination, onClose, onExplore }: DestinationPreviewModalProps) {
  const { t } = useTranslation("customer");
  const { savedStates, toggleSaved } = useSavedDestinations();
  useEffect(() => {
    if (!destination) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [destination, onClose]);

  if (!destination) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#06102a]/60 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="destination-preview-title"
        aria-describedby="destination-preview-description"
        className="relative w-full max-w-2xl overflow-hidden rounded-[28px] bg-white text-slate-950 shadow-2xl shadow-[#06102a]/25"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="relative h-56 overflow-hidden sm:h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={destination.image} alt={`${destination.attraction}, ${destination.state}`} className="h-full w-full object-cover saturate-[1.2] contrast-[1.04]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.02),rgba(2,6,23,0.72))]" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-accent"><MapPin size={13} /> {destination.zone}</p>
            <h2 id="destination-preview-title" className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight sm:text-5xl">{destination.state}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("actions.close", { ns: "common" })}
            autoFocus
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-slate-800 shadow-lg transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 sm:p-8">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-primary">{destination.attraction}</p>
          <p id="destination-preview-description" className="mt-3 max-w-xl text-base leading-7 text-slate-600">{destination.intro}</p>

          <div className="mt-6 flex flex-wrap gap-2" aria-label={`${destination.state} highlights`}>
            {destination.highlights.map((highlight) => (
              <span key={highlight} className="rounded-full border border-[#d8def2] bg-[#f4f6ff] px-3 py-1.5 text-xs font-semibold text-primary">{highlight}</span>
            ))}
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => void toggleSaved(destination.state)}
              aria-pressed={savedStates.has(destination.state)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/20 px-4 py-2.5 text-sm font-semibold text-primary transition hover:border-primary hover:bg-[#f4f6ff] focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            >
              <Bookmark size={15} fill={savedStates.has(destination.state) ? "currentColor" : "none"} />
              {savedStates.has(destination.state) ? t("ui.map.savedToAtlas") : t("ui.map.saveToAtlas")}
            </button>
            <button type="button" onClick={() => onExplore(destination.state)} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#101b66] focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2">
              <span>{t("ui.map.exploreState", { state: destination.state })}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
