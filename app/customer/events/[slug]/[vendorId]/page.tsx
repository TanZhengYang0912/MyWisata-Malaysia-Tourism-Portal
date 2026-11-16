import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/shared/back-link";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Clock, MapPin, Store } from "lucide-react";
import { getServerTranslation } from "@/lib/i18n/server";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";
import { getPublicPromotionCampaigns } from "@/lib/promotion-campaigns/public";
import { campaignSlugSchema } from "@/lib/promotion-campaigns/validation";
import {
  formatEventDateRange,
  formatEventHours,
  formatEventShortDateRange,
  getDefaultStopId,
  getEventLocationPhase,
  PHASE_LABEL_KEY,
  type EventLocationPhase,
} from "@/lib/promotion-campaigns/locations";
import type { PromotionCampaignPublic, PromotionCampaignPublicLocation, PromotionCampaignPublicStall, PromotionCampaignPublicVendor } from "@/lib/promotion-campaigns/types";
import { CustomerPageHeader, CustomerPageShell, CustomerSectionHeader } from "@/components/customer/customer-page-shell";
import { StallProductCard } from "./stall-product-card";

type Props = {
  params: Promise<{ slug: string; vendorId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

type StallAtStop = { stall: PromotionCampaignPublicStall; location: PromotionCampaignPublicLocation; phase: EventLocationPhase };

async function findVendor(slug: string, vendorId: string) {
  const parsedSlug = campaignSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return null;
  const result = await getPublicPromotionCampaigns(parsedSlug.data);
  const campaign = result.campaigns[0];
  if (!campaign) return null;
  const vendor = campaign.vendors.find((entry) => entry.vendorId === vendorId);
  if (!vendor || vendor.stalls.length === 0) return null;
  return { campaign, vendor };
}

/**
 * The stall the visitor came from (`?stop=` is a location id), else the vendor's running stall, else the next
 * one to start, else the last. Stalls whose location is missing are skipped; null when none is left.
 */
function selectStall(campaign: PromotionCampaignPublic, vendor: PromotionCampaignPublicVendor, stop: string | string[] | undefined) {
  const locationsById = new Map(campaign.locations.map((location) => [location.id, location]));
  const now = new Date();
  const stalls: StallAtStop[] = vendor.stalls
    .flatMap((stall) => {
      const location = locationsById.get(stall.locationId);
      return location ? [{ stall, location, phase: getEventLocationPhase(location, now) }] : [];
    })
    .sort((a, b) => a.location.startsOn.localeCompare(b.location.startsOn) || a.location.opensAt.localeCompare(b.location.opensAt));
  if (stalls.length === 0) return null;
  const requested = typeof stop === "string" ? stop : undefined;
  const selectedId = stalls.some((entry) => entry.location.id === requested)
    ? requested
    : getDefaultStopId(stalls.map((entry) => entry.location), new Map(stalls.map((entry) => [entry.location.id, entry.phase])));
  const selected = stalls.find((entry) => entry.location.id === selectedId) ?? stalls[0];
  return { selected, others: stalls.filter((entry) => entry !== selected) };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug, vendorId }, { stop }] = await Promise.all([params, searchParams]);
  const found = await findVendor(slug, vendorId);
  const stall = found && selectStall(found.campaign, found.vendor, stop)?.selected.stall;
  if (!found || !stall) return { title: `${BRAND_NAME}` };
  const title = `${found.vendor.vendorName} · ${found.campaign.title} — ${BRAND_NAME}`;
  return { title, description: stall.stallDescription.slice(0, 160) };
}

export default async function EventVendorStallPage({ params, searchParams }: Props) {
  const [{ slug, vendorId }, { stop }] = await Promise.all([params, searchParams]);
  const { t, locale } = await getServerTranslation("customer");
  const { t: tCommon } = await getServerTranslation("common");
  const found = await findVendor(slug, vendorId);
  if (!found) notFound();
  const { campaign, vendor } = found;
  const selection = selectStall(campaign, vendor, stop);
  if (!selection) notFound();
  const { selected: { stall, location, phase }, others } = selection;
  const stallHref = (locationId: string) => `/customer/events/${encodeURIComponent(slug)}/${encodeURIComponent(vendorId)}?stop=${encodeURIComponent(locationId)}`;
  const eventHref = `/customer/events/${encodeURIComponent(slug)}?stop=${encodeURIComponent(location.id)}`;
  return (
    <CustomerPageShell wide>
      <Breadcrumbs className="mb-4" label={t("ui.place.breadcrumb")} items={[
        { label: t("navigation.home"), href: "/customer" },
        { label: t("navigation.events"), href: "/customer/events" },
        { label: campaign.title, href: eventHref },
        { label: vendor.vendorName },
      ]} />
      <BackLink fallbackHref={eventHref} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> {tCommon("actions.back")}
      </BackLink>

      <CustomerPageHeader
        title={vendor.vendorName}
        description={vendor.vendorKind === "event" ? (
          <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:text-amber-200">{t("ui.eventPartners.badge")}</span>
        ) : undefined}
        actions={
          <Link href={`/customer/vendors/${encodeURIComponent(vendorId)}`} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 text-sm font-bold text-primary transition-colors hover:text-accent active:text-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
            {t("ui.actions.visitVendor")} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        }
      />

      <section aria-label={location.name}>
        <div className="mb-4 rounded-3xl border border-border bg-card p-4 shadow-sm sm:mb-5 sm:p-5">
          <p className="flex items-center gap-2 font-semibold text-foreground"><MapPin size={16} className="text-primary" aria-hidden="true" />{location.name}</p>
          <p className="mt-1 break-words pl-6 text-sm text-muted-foreground">{location.address ?? t("ui.promotionCampaigns.addressTba")}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 pl-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><CalendarDays size={14} aria-hidden="true" />{formatEventDateRange(location.startsOn, location.endsOn, locale)}</span>
            <span className="flex items-center gap-1.5"><Clock size={14} aria-hidden="true" />{formatEventHours(location.opensAt, location.closesAt, locale)}</span>
            <span className="flex items-center gap-1.5"><Store size={14} aria-hidden="true" />{t("ui.promotionCampaigns.stallNumber", { number: stall.stallNumber })}</span>
          </div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={stall.stallPosterUrl} alt="" className="h-52 w-full rounded-3xl border border-border object-cover shadow-sm sm:h-72 lg:h-80" />

        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground sm:mt-5">{stall.stallDescription}</p>
      </section>

      {stall.products.length > 0 && (
        <section aria-labelledby="stall-products-heading" className="mt-12">
          <CustomerSectionHeader id="stall-products-heading" title={t("ui.promotionCampaigns.stallProducts")} />
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {stall.products.map((product) => (
              <StallProductCard
                key={product.id}
                product={product}
                registrationId={stall.registrationId}
                location={{ name: location.name, startsOn: location.startsOn, endsOn: location.endsOn }}
                isEnded={phase === "ended"}
              />
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section aria-labelledby="stall-also-at-heading" className="mt-12">
          <CustomerSectionHeader id="stall-also-at-heading" title={t("ui.promotionCampaigns.alsoAt")} />
          <ul className="divide-y divide-border">
            {others.map((entry) => (
              <li key={entry.stall.registrationId}>
                <Link
                  href={stallHref(entry.location.id)}
                  className="group/stop grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-1 py-4 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-primary sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
                >
                  <MapPin size={16} className="row-span-2 text-primary sm:row-span-1" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block font-bold text-primary transition-colors group-hover/stop:text-accent group-active/stop:text-accent">{entry.location.name}</span>
                    <span className={`block text-xs font-semibold ${entry.phase === "running" ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{t(PHASE_LABEL_KEY[entry.phase])}</span>
                  </span>
                  <span className="col-start-2 text-[13px] text-muted-foreground sm:col-start-auto sm:whitespace-nowrap">
                    {formatEventShortDateRange(entry.location.startsOn, entry.location.endsOn, locale)} · {t("ui.promotionCampaigns.stallNumber", { number: entry.stall.stallNumber })}
                  </span>
                  <ChevronRight size={18} className="col-start-3 row-span-2 row-start-1 text-primary transition-colors group-hover/stop:text-accent group-active/stop:text-accent sm:col-start-auto sm:row-span-1" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </CustomerPageShell>
  );
}
