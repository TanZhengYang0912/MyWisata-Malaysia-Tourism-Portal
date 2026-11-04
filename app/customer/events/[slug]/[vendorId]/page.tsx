import type { Metadata } from "next";
import { BackLink } from "@/components/shared/back-link";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, MapPin, Store } from "lucide-react";
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

      <div className="flex items-center gap-3">
        <Store className="text-primary" size={22} aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{vendor.vendorName}</h1>
          {vendor.vendorKind === "event" && (
            <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:text-amber-200">{t("ui.eventPartners.badge")}</span>
          )}
          {vendor.stalls.length > 1 && (
            <p className="text-sm text-muted-foreground">{t("ui.promotionCampaigns.locationCount", { count: vendor.stalls.length })}</p>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-10">
        {vendor.stalls.map((stall) => {
          const location = locationsById.get(stall.locationId);
          return (
            <section key={stall.registrationId} aria-label={location?.name ?? stall.stallNumber}>
              {location && (
                <div className="mb-4 rounded-2xl border border-border bg-card p-4">
                  <p className="flex items-center gap-2 font-semibold text-foreground"><MapPin size={16} className="text-primary" aria-hidden="true" />{location.name}</p>
                  <p className="mt-1 break-words pl-6 text-sm text-muted-foreground">{location.address ?? t("ui.promotionCampaigns.addressTba")}</p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 pl-6 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><CalendarDays size={14} aria-hidden="true" />{formatEventDateRange(location.startsOn, location.endsOn, locale)}</span>
                    <span className="flex items-center gap-1.5"><Clock size={14} aria-hidden="true" />{formatEventHours(location.opensAt, location.closesAt, locale)}</span>
                    <span className="flex items-center gap-1.5"><Store size={14} aria-hidden="true" />{t("ui.promotionCampaigns.stallNumber", { number: stall.stallNumber })}</span>
                  </div>
                </div>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={stall.stallPosterUrl} alt="" className="h-56 w-full rounded-2xl border border-border object-cover sm:h-72 lg:h-80" />

              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{stall.stallDescription}</p>

              {stall.products.length > 0 && (
                <div className="mt-6">
                  <h2 className="text-lg font-bold text-foreground">{t("ui.promotionCampaigns.stallProducts")}</h2>
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {stall.products.map((product) => (
                      <li key={product.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className="h-14 w-14 shrink-0 rounded-lg bg-secondary" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
                          <p className="text-sm text-primary">{product.price === 0 ? t("ui.reserve.free") : formatMYR(product.price)}</p>
                        </div>
                        {location && (
                          <EventReserveButton
                            registrationId={stall.registrationId}
                            listingId={product.id}
                            itemName={product.name}
                            price={product.price}
                            locationName={location.name}
                            startsOn={location.startsOn}
                            endsOn={location.endsOn}
                          />
                        )}
                      </li>
                    ))}
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
