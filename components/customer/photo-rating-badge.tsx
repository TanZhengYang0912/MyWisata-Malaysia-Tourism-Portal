import { useId } from "react";
import { Megaphone, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/components/utils";

// Decorative score scale (rating → colour); no existing token covers it.
const STOPS: Array<[number, [number, number, number]]> = [
  [0, [0xf0, 0x7c, 0x24]], [1, [0xf1, 0x93, 0x26]], [1.5, [0xe9, 0xa6, 0x2a]], [2, [0xdb, 0xb5, 0x2f]],
  [2.5, [0xc9, 0xc2, 0x3c]], [3, [0xb3, 0xc9, 0x4f]], [3.5, [0x94, 0xc9, 0x6e]], [4, [0x6c, 0xc4, 0x8f]],
  [4.5, [0x4f, 0xc0, 0xb9]], [5, [0x2b, 0xb7, 0xd6]],
];

export function ratingColor(rating: number): string {
  const r = Math.min(5, Math.max(0, rating));
  const i = Math.max(1, STOPS.findIndex(([at]) => at >= r));
  const [lo, from] = STOPS[i - 1];
  const [hi, to] = STOPS[i];
  const k = (r - lo) / (hi - lo);
  return `#${from.map((c, n) => Math.round(c + (to[n] - c) * k).toString(16).padStart(2, "0")).join("")}`;
}

/** Dark glass shared by every pill that sits on a card photo. */
const PHOTO_GLASS = "bg-[rgba(15,15,30,.6)] text-white backdrop-blur-[8px]";

const STAR = "M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.2l7.1-.6z";

/** Rating pill for a card photo; the caller positions it with `className`. */
export function PhotoRatingBadge({ rating, reviews, className, compactOnPhone }: { rating: number; reviews: number; className?: string; compactOnPhone?: boolean }) {
  const { t } = useTranslation("customer");
  const gradientId = useId().replace(/:/g, "");
  const percent = reviews > 0 ? Math.round(Math.min(5, Math.max(0, rating)) / 5 * 100) : 0;
  const iconOnly = compactOnPhone && reviews === 0;
  return <div
    data-slot="photo-rating-badge"
    className={cn("pointer-events-none inline-flex items-center gap-1 whitespace-nowrap rounded-full py-[3px] pl-1 pr-2 leading-none", PHOTO_GLASS, iconOnly && "max-sm:pr-1", className)}
  >
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
          <stop offset={`${percent}%`} stopColor={ratingColor(rating)} />
          <stop offset={`${percent}%`} stopColor="rgba(255,255,255,.25)" />
        </linearGradient>
      </defs>
      <path d={STAR} fill={`url(#${gradientId})`} />
    </svg>
    {reviews > 0
      ? <><span className="text-xs font-extrabold">{rating.toFixed(1)}</span><span className="text-[10px] opacity-70">{`(${reviews})`}</span></>
      : <span className={cn("text-[10.5px] opacity-90", iconOnly && "sr-only sm:not-sr-only")}>{t("ui.activity.noReviewsYet")}</span>}
  </div>;
}

const photoLabelClass = `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10px] font-bold ${PHOTO_GLASS}`;

/** Paid placement and merchant ⭐ labels for a card photo's top-left; they wrap rather than run under the save/share buttons. */
export function PhotoCardLabels({ sponsored, featured }: { sponsored?: boolean; featured?: boolean }) {
  const { t } = useTranslation("customer");
  if (!sponsored && !featured) return null;
  return <div className="pointer-events-none absolute left-3 right-14 top-3 z-10 flex flex-wrap gap-1">
    {sponsored && <span className={photoLabelClass}><Megaphone size={11} aria-hidden="true" />{t("ui.labels.sponsored")}</span>}
    {featured && <span className={photoLabelClass}><Sparkles size={11} className="text-[#ffcc00]" aria-hidden="true" />{t("ui.labels.featured")}</span>}
  </div>;
}
