import Link from "next/link";
import { CalendarX, ChevronRight } from "lucide-react";
import { ReferencePrice } from "@/components/shared/reference-price";
import { getServerTranslation } from "@/lib/i18n/server";
import { formatEventDateRange, formatEventHours } from "@/lib/promotion-campaigns/locations";
import { groupVendorEventItems, type VendorEventItem } from "@/lib/promotion-campaigns/vendor-events";

// Stop columns shared by the heading row and each stop row (desktop): location, date, time, price + chevron.
const STOP_COLUMNS = "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.9fr)_8rem]";

/**
 * A vendor's event items grouped by item: each item once, with every upcoming or live stop under it.
 * A stop row links to the vendor's stall page at that stop, where tapping the item reserves it.
 * Lists, not a table: a whole-row link needs a positioned row, which table rows do not reliably give.
 */
export async function EventItemsTable({ items, vendorId }: { items: VendorEventItem[]; vendorId: string }) {
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

  const price = (amount: number, className: string) => amount === 0
    ? <span className={className}>{t("ui.vendor.eventItems.free")}</span>
    : <ReferencePrice amountMYR={amount} className={className} />;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div aria-hidden="true" className="hidden bg-secondary/50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
        <span />
        <span className={`grid gap-x-4 ${STOP_COLUMNS}`}>
          <span>{t("ui.vendor.eventItems.location")}</span>
          <span>{t("ui.vendor.eventItems.date")}</span>
          <span>{t("ui.vendor.eventItems.time")}</span>
          <span />
        </span>
      </div>
      <ul aria-label={t("ui.vendor.eventItems.caption")} className="divide-y divide-border">
        {groupVendorEventItems(items).map((group) => (
          <li key={group.key} data-event-item-group="" className="grid px-4 pb-2 sm:px-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:py-2">
            <div className="flex items-start gap-3.5 pt-4 pb-2 lg:py-3.5 lg:pr-4">
              {group.product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={group.product.imageUrl} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="size-16 shrink-0 rounded-xl bg-secondary" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="break-words font-bold leading-snug text-foreground">{group.product.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t(`ui.vendor.eventItems.kinds.${group.product.kind}`)}</p>
                {group.samePrice && price(group.product.price, "mt-1.5 block font-extrabold tabular-nums text-primary")}
              </div>
            </div>
            <ol aria-label={group.product.name} className="divide-y divide-dashed divide-border">
              {group.stops.map((item) => (
                <li
                  key={item.key}
                  className={`group/stop relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-[10px] py-3 text-sm transition-colors hover:bg-primary/[0.04] has-[[data-stop-link]:focus-visible]:outline-[3px] has-[[data-stop-link]:focus-visible]:outline-offset-[-3px] has-[[data-stop-link]:focus-visible]:outline-primary lg:-mx-2.5 lg:gap-x-4 lg:px-2.5 lg:py-3.5 ${STOP_COLUMNS}`}
                >
                  <div className="min-w-0">
                    <Link
                      href={`/customer/events/${encodeURIComponent(item.campaignSlug)}/${encodeURIComponent(vendorId)}?stop=${encodeURIComponent(item.location.id)}`}
                      data-stop-link=""
                      className="break-words font-semibold text-foreground after:absolute after:inset-0 after:rounded-[10px] after:content-[''] focus-visible:outline-none"
                    >
                      {item.location.name}
                    </Link>
                    <p className="break-words text-xs text-muted-foreground">
                      <Link href={`/customer/events/${encodeURIComponent(item.campaignSlug)}`} className="relative z-10 font-semibold text-primary transition-colors hover:text-accent">
                        {item.campaignTitle}
                      </Link>
                      {item.stallNumber && <> · {t("ui.vendor.eventItems.stall", { stall: item.stallNumber })}</>}
                    </p>
                  </div>
                  <p className="col-start-1 text-[13px] text-muted-foreground lg:contents lg:text-sm">
                    <span className="lg:whitespace-nowrap">{formatEventDateRange(item.location.startsOn, item.location.endsOn, locale)}</span>
                    <span aria-hidden="true" className="lg:hidden"> · </span>
                    <span className="lg:whitespace-nowrap">{formatEventHours(item.location.opensAt, item.location.closesAt, locale)}</span>
                  </p>
                  <div className="col-start-2 row-span-2 row-start-1 flex items-center justify-end gap-3 lg:col-start-auto lg:row-span-1 lg:row-start-auto">
                    {!group.samePrice && price(item.product.price, "font-extrabold tabular-nums text-primary")}
                    <ChevronRight size={18} className="text-primary transition-colors group-hover/stop:text-accent group-active/stop:text-accent" aria-hidden="true" />
                  </div>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
    </div>
  );
}
