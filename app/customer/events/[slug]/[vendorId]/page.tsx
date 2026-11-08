import type { Metadata } from "next";
import { BackLink } from "@/components/shared/back-link";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, ImageOff, MapPin, Store } from "lucide-react";
import { getServerTranslation } from "@/lib/i18n/server";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";
import { getPublicPromotionCampaigns } from "@/lib/promotion-campaigns/public";
import { campaignSlugSchema } from "@/lib/promotion-campaigns/validation";
import { formatEventDateRange, formatEventHours } from "@/lib/promotion-campaigns/locations";
import { formatMYR } from "@/lib/i18n/format";
import { CustomerPageShell } from "@/components/customer/customer-page-shell";
import { EventReserveButton } from "@/components/customer/event-reserve-dialog";

type Props = { params: Promise<{ slug: string; vendorId: string }> };

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, vendorId } = await params;
  const found = await findVendor(slug, vendorId);
  if (!found) return { title: `${BRAND_NAME}` };
  const title = `${found.vendor.vendorName} · ${found.campaign.title} — ${BRAND_NAME}`;
  return { title, description: found.vendor.stalls[0].stallDescription.slice(0, 160) };
}

export default async function EventVendorStallPage({ params }: Props) {
  const { slug, vendorId } = await params;
  const { t, locale } = await getServerTranslation("customer");
  const { t: tCommon } = await getServerTranslation("common");
  const found = await findVendor(slug, vendorId);
  if (!found) notFound();
  const { campaign, vendor } = found;
  const locationsById = new Map(campaign.locations.map((location) => [location.id, location]));

  return (
    <CustomerPageShell wide>
      <Breadcrumbs className="mb-4" label={t("ui.place.breadcrumb")} items={[
        { label: t("navigation.home"), href: "/customer" },
        { label: t("navigation.events"), href: "/customer/events" },
        { label: campaign.title, href: `/customer/events/${encodeURIComponent(slug)}` },
        { label: vendor.vendorName },
      ]} />
      <BackLink fallbackHref={`/customer/events/${encodeURIComponent(slug)}`} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> {tCommon("actions.back")}
      </BackLink>

      <div className="flex items-start gap-3 sm:items-center">
        <Store className="mt-1 shrink-0 text-primary sm:mt-0" size={22} aria-hidden="true" />
        <div>
          <h1 className="text-3xl leading-tight font-black tracking-tight text-foreground sm:text-4xl">{vendor.vendorName}</h1>
          {vendor.vendorKind === "event" && (
            <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:text-amber-200">{t("ui.eventPartners.badge")}</span>
          )}
          {vendor.stalls.length > 1 && (
            <p className="text-sm text-muted-foreground">{t("ui.promotionCampaigns.locationCount", { count: vendor.stalls.length })}</p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-8 sm:mt-6 sm:space-y-10">
        {vendor.stalls.map((stall) => {
          const location = locationsById.get(stall.locationId);
          return (
            <section key={stall.registrationId} aria-label={location?.name ?? stall.stallNumber}>
              {location && (
                <div className="mb-4 rounded-3xl border border-border bg-card p-4 shadow-sm sm:mb-5 sm:p-5">
                  <p className="flex items-center gap-2 font-semibold text-foreground"><MapPin size={16} className="text-primary" aria-hidden="true" />{location.name}</p>
                  <p className="mt-1 break-words pl-6 text-sm text-muted-foreground">{location.address ?? t("ui.promotionCampaigns.addressTba")}</p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 pl-6 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><CalendarDays size={14} aria-hidden="true" />{formatEventDateRange(location.startsOn, location.endsOn, locale)}</span>
                    <span className="flex items-center gap-1.5"><Clock size={14} aria-hidden="true" />{formatEventHours(location.opensAt, location.closesAt, locale)}</span>
                    <span className="flex items-center gap-1.5"><Store size={14} aria-hidden="true" />{t("ui.promotionCampaigns.stallNumber", { number: stall.stallNumber })}</span>
                  </div>
                </div>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stall.stallPosterUrl} alt="" className="h-52 w-full rounded-3xl border border-border object-cover shadow-sm sm:h-72 lg:h-80" />

              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted-foreground sm:mt-5">{stall.stallDescription}</p>

              {stall.products.length > 0 && (
                <div className="mt-6 rounded-3xl border border-primary/10 bg-card p-4 shadow-sm sm:mt-7 sm:p-7">
                  <h2 className="border-b border-border pb-4 text-xl font-bold tracking-tight text-foreground sm:pb-5 sm:text-2xl">{t("ui.promotionCampaigns.stallProducts")}</h2>
                  <ul className="mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
                    {stall.products.map((product) => {
                      return (
                        <li key={product.id} className="mw-card min-w-0">
                          <div className="mw-card-media">
                            {product.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={product.imageUrl} alt={product.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full flex-col items-center justify-center bg-secondary text-primary">
                                <ImageOff size={28} strokeWidth={1.5} aria-hidden="true" />
                                <span className="mt-2 text-xs font-semibold text-muted-foreground">{t("ui.outlet.photoComingSoon")}</span>
                              </div>
                            )}
                          </div>
                          <div className="mw-card-body !min-h-0 p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="mw-card-title flex-1 text-base leading-snug font-bold text-foreground">{product.name}</h3>
                              <p className="shrink-0 text-right text-lg leading-tight font-bold text-primary">
                                {product.price === 0 ? t("ui.reserve.free") : formatMYR(product.price)}
                              </p>
                            </div>
                            {location && (
                              <div className="mt-auto pt-4 [&>button]:h-11 [&>button]:w-full">
                                <EventReserveButton
                                  registrationId={stall.registrationId}
                                  listingId={product.id}
                                  itemName={product.name}
                                  price={product.price}
                                  locationName={location.name}
                                  startsOn={location.startsOn}
                                  endsOn={location.endsOn}
                                />
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </CustomerPageShell>
  );
}
