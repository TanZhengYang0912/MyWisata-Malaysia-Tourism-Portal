"use client";

import { CalendarDays, Megaphone, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";
import { formatEventDateRange } from "@/lib/promotion-campaigns/locations";
import { CardLocation } from "@/components/customer/card-frame";
import { VendorCard } from "@/components/customer/vendor-card";
import { SeeMoreLink } from "@/components/customer/see-more-link";

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
        <SeeMoreLink href="/customer/vendors" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        {partners.map((partner) => (
          <EventPartnerCard key={partner.id} partner={partner} locale={locale} featured />
        ))}
      </div>
    </section>
  );
}

/** One event partner on the shared VendorCard: the event badge on the photo and the next event in place of the locations row. */
function EventPartnerCard({ partner, locale, featured = false }: { partner: EventPartner; locale: AppLocale; featured?: boolean }) {
  const { t } = useTranslation("customer");
  const eventSchedule = partner.next
    ? t("ui.eventPartners.next", {
      event: partner.next.campaignTitle,
      location: partner.next.locationName,
      dates: formatEventDateRange(partner.next.startsOn, partner.next.endsOn, locale),
    })
    : t("ui.eventPartners.noUpcoming");

  return (
    <VendorCard
      vendor={{ id: partner.id, name: partner.name, logoUrl: partner.logoUrl, coverUrl: partner.coverUrl, outlets: [] }}
      badge={
        <span className="inline-flex items-center gap-1 rounded-full bg-[#ffcc00] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#010066] max-sm:px-1.5 max-sm:text-[8px]">
          <Sparkles size={11} aria-hidden="true" /> {featured ? t("ui.home.eventFeaturedPartnerBadge") : t("ui.eventPartners.badge")}
        </span>
      }
      info={<CardLocation icon={<CalendarDays size={13} className="text-primary" aria-hidden="true" />}>{eventSchedule}</CardLocation>}
    />
  );
}
