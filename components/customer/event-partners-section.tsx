"use client";

import { CalendarDays, Megaphone, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";
import { formatEventDateRange } from "@/lib/promotion-campaigns/locations";
import { CardLocation } from "@/components/customer/card-frame";
import { VendorCard } from "@/components/customer/vendor-card";
import { SeeMoreLink } from "@/components/customer/see-more-link";
import { CardCarousel } from "@/components/customer/card-carousel";
import { CustomerSectionHeader } from "@/components/customer/customer-page-shell";

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
  if (featured) return <FeaturedEventPartnersSection partners={partners} />;

  return (
    <section aria-labelledby="event-partners-heading" className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
      <CustomerSectionHeader
        id="event-partners-heading"
        eyebrow={<span className="inline-flex items-center gap-1.5"><Megaphone size={14} aria-hidden="true" /> {t("ui.eventPartners.eyebrow")}</span>}
        title={t("ui.eventPartners.title")}
      >
        <p className="mt-1 text-sm text-muted-foreground">{t("ui.eventPartners.description")}</p>
      </CustomerSectionHeader>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
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
      <CustomerSectionHeader
        id="event-featured-partners-heading"
        icon={<Sparkles size={19} className="text-primary" aria-hidden="true" />}
        title={t("ui.home.eventFeaturedPartners")}
        action={<SeeMoreLink href="/customer/vendors" />}
      />
      <CardCarousel label={t("ui.home.eventFeaturedPartners")}>
        {partners.map((partner) => (
          <EventPartnerCard key={partner.id} partner={partner} locale={locale} featured />
        ))}
      </CardCarousel>
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
