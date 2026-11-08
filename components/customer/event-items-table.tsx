import Link from "next/link";
import { CalendarX } from "lucide-react";
import { ReferencePrice } from "@/components/shared/reference-price";
import { EventReserveButton } from "@/components/customer/event-reserve-dialog";
import { getServerTranslation } from "@/lib/i18n/server";
import { formatEventDateRange, formatEventHours } from "@/lib/promotion-campaigns/locations";
import type { VendorEventItem } from "@/lib/promotion-campaigns/vendor-events";

/** A vendor's event items as a table: item, location, date, time, price and reserve. */
export async function EventItemsTable({ items }: { items: VendorEventItem[] }) {
  const { t, locale } = await getServerTranslation("customer");
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <CalendarX size={26} className="text-primary" aria-hidden="true" />
        <p className="font-semibold text-foreground">{t("ui.vendor.eventItems.noUpcomingEvent")}</p>
        <p className="text-sm text-muted-foreground">{t("ui.vendor.eventItems.noUpcomingEventHint")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="block w-full min-w-0 text-left text-sm lg:table lg:min-w-[760px]">
        <caption className="sr-only">{t("ui.vendor.eventItems.caption")}</caption>
        <thead className="sr-only bg-secondary/50 text-xs font-bold uppercase tracking-wide text-muted-foreground lg:not-sr-only lg:table-header-group">
          <tr className="lg:table-row">
            <th scope="col" className="px-4 py-3">{t("ui.vendor.eventItems.item")}</th>
            <th scope="col" className="px-4 py-3">{t("ui.vendor.eventItems.location")}</th>
            <th scope="col" className="px-4 py-3">{t("ui.vendor.eventItems.date")}</th>
            <th scope="col" className="px-4 py-3">{t("ui.vendor.eventItems.time")}</th>
            <th scope="col" className="px-4 py-3 text-right">{t("ui.vendor.eventItems.price")}</th>
            <th scope="col" className="px-4 py-3"><span className="sr-only">{t("ui.vendor.eventItems.reserve")}</span></th>
          </tr>
        </thead>
        <tbody className="block space-y-3 p-3 lg:table-row-group lg:space-y-0 lg:divide-y lg:divide-border lg:p-0">
          {items.map((item) => (
            <tr key={item.key} className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl border border-border bg-card p-4 lg:table-row lg:rounded-none lg:border-0 lg:p-0">
              <td className="col-span-2 block p-0 lg:table-cell lg:px-4 lg:py-3">
                <div className="flex items-start gap-3 lg:items-center">
                  {item.product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.product.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover lg:h-11 lg:w-11 lg:rounded-lg" />
                  ) : (
                    <div className="h-14 w-14 shrink-0 rounded-xl bg-secondary lg:h-11 lg:w-11 lg:rounded-lg" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-foreground">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground">{t(`ui.vendor.eventItems.kinds.${item.product.kind}`)}</p>
                  </div>
                </div>
              </td>
              <td className="col-span-2 block min-w-0 p-0 lg:table-cell lg:px-4 lg:py-3">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground lg:hidden">{t("ui.vendor.eventItems.location")}</span>
                <p className="break-words font-semibold text-foreground">{item.location.name}</p>
                <Link href={`/customer/events/${encodeURIComponent(item.campaignSlug)}`} className="break-words text-xs font-semibold text-primary hover:underline">
                  {item.campaignTitle}
                </Link>
                {item.stallNumber && <p className="text-xs text-muted-foreground">{t("ui.vendor.eventItems.stall", { stall: item.stallNumber })}</p>}
              </td>
              <td className="block min-w-0 p-0 text-muted-foreground lg:table-cell lg:whitespace-nowrap lg:px-4 lg:py-3">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground lg:hidden">{t("ui.vendor.eventItems.date")}</span>
                <span className="break-words">{formatEventDateRange(item.location.startsOn, item.location.endsOn, locale)}</span>
              </td>
              <td className="block min-w-0 p-0 text-muted-foreground lg:table-cell lg:whitespace-nowrap lg:px-4 lg:py-3">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground lg:hidden">{t("ui.vendor.eventItems.time")}</span>
                <span className="break-words">{formatEventHours(item.location.opensAt, item.location.closesAt, locale)}</span>
              </td>
              <td className="block min-w-0 p-0 text-left font-semibold text-foreground lg:table-cell lg:whitespace-nowrap lg:px-4 lg:py-3 lg:text-right">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground lg:hidden">{t("ui.vendor.eventItems.price")}</span>
                {item.product.price === 0 ? t("ui.vendor.eventItems.free") : <ReferencePrice amountMYR={item.product.price} />}
              </td>
              <td className="block p-0 text-right lg:table-cell lg:px-4 lg:py-3">
                <div className="flex min-h-11 items-end justify-end lg:min-h-0 lg:items-center">
                  <EventReserveButton
                    registrationId={item.registrationId}
                    listingId={item.product.id}
                    itemName={item.product.name}
                    price={item.product.price}
                    locationName={item.location.name}
                    startsOn={item.location.startsOn}
                    endsOn={item.location.endsOn}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
