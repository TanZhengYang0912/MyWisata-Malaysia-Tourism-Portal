"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Megaphone, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getVendorVisual } from "@/lib/customer/vendor-visual";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";
import { formatEventDateRange } from "@/lib/promotion-campaigns/locations";
import { ExpandCard } from "@/components/customer/expand-card";

export type EventPartner = {
  id: string;
  name: string;
  logoUrl: string | null;
  coverUrl?: string | null;
  description?: string | null;
  /** Soonest event location the partner is at, or null when none is scheduled. */
  next: { campaignTitle: string; locationName: string; startsOn: string; endsOn: string } | null;
};

/** Event vendors stay separate from the partner directory and keep context-specific badge labels. */
export function EventPartnersSection({ partners, featured = false }: { partners: EventPartner[]; featured?: boolean }) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  if (partners.length === 0) return null;
  if (featured) return <FeaturedEventPartnersSection partners={partners.slice(0, 4)} />;

  return (
    <section aria-labelledby="event-partners-heading" className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Megaphone size={14} aria-hidden="true" /> {t("ui.eventPartners.eyebrow")}</p>
      <h2 id="event-partners-heading" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold">{t("ui.eventPartners.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("ui.eventPartners.description")}</p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {partners.map((partner) => <EventPartnerCard key={partner.id} partner={partner} locale={locale} />)}
      </div>
    </section>
  );
}

function FeaturedEventPartnersSection({ partners }: { partners: EventPartner[] }) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;

  return (
    <section aria-labelledby="event-featured-partners-heading" className="mt-12">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 id="event-featured-partners-heading" className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold">
          <Sparkles size={19} className="text-primary" aria-hidden="true" />
          {t("ui.home.eventFeaturedPartners")}
        </h2>
        <Link href="/customer/vendors" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
          {t("ui.home.viewPartners")} <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {partners.map((partner) => (
          <EventPartnerCard key={partner.id} partner={partner} locale={locale} featured />
        ))}
      </div>
    </section>
  );
}

/** One event partner on the shared ExpandCard: name and badge up front, event details in the drawer. */
function EventPartnerCard({ partner, locale, featured = false }: { partner: EventPartner; locale: AppLocale; featured?: boolean }) {
  const { t } = useTranslation("customer");
  const visual = getVendorVisual(partner);
  const href = `/customer/vendors/${partner.id}`;
  const eventSchedule = partner.next
    ? t("ui.eventPartners.next", {
      event: partner.next.campaignTitle,
      location: partner.next.locationName,
      dates: formatEventDateRange(partner.next.startsOn, partner.next.endsOn, locale),
    })
    : t("ui.eventPartners.noUpcoming");

  return (
    <ExpandCard
      media={
        <Link href={href} className="group/partner-media absolute inset-0 block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[#ffcc00]/60">
          {visual.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={visual.coverUrl} alt={t("ui.search.businessCover", { vendor: partner.name })} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover/partner-media:scale-105" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_25%_20%,rgba(255,204,0,0.28),transparent_28%),linear-gradient(135deg,#010066,#172b72_58%,#2d5273)]">
              <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-white/25 bg-white/10 dark:bg-card/10 text-2xl font-black text-white shadow-xl backdrop-blur-sm">
                {visual.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={visual.logoUrl} alt="" className="h-full w-full object-contain p-2" />
                ) : visual.initials}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          <span className={`absolute left-3 top-3 inline-flex items-center rounded-full bg-[#ffcc00] font-bold uppercase text-[#010066] ${featured ? "gap-0.5 px-1 py-0.5 text-[8px] tracking-[0.04em] sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[10px] sm:tracking-[0.12em]" : "gap-1.5 px-2.5 py-1 text-[10px] tracking-[0.12em]"}`}>
            <Sparkles size={11} className={featured ? "h-2 w-2 sm:h-[11px] sm:w-[11px]" : undefined} aria-hidden="true" /> {featured ? t("ui.home.eventFeaturedPartnerBadge") : t("ui.eventPartners.badge")}
          </span>
        </Link>
      }
      title={
        <Link href={href} className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30">
          <h3 className="mw-card-title text-sm font-bold leading-snug text-foreground" title={partner.name}>{partner.name}</h3>
        </Link>
      }
      details={<>
        {partner.next && <p className="flex items-start gap-1.5 text-xs font-semibold text-foreground"><MapPin size={12} className="mt-0.5 shrink-0" aria-hidden="true" />{partner.next.locationName}</p>}
        <p className="flex items-start gap-1.5 text-xs leading-5 text-muted-foreground"><CalendarDays size={12} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />{eventSchedule}</p>
        {partner.description?.trim() && <p className="break-words whitespace-normal text-xs leading-5 text-foreground/80">{partner.description}</p>}
      </>}
      detailsId={`event-partner-details-${partner.id}`}
      action={{ href, label: t("ui.eventPartners.view") }}
    />
  );
}
