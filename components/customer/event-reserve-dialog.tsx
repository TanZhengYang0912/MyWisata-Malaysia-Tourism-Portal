"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { CalendarCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";
import { InternationalPhoneInput } from "@/components/profile/international-phone-input";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { PAYMENT_CHOICES } from "@/lib/checkout/payment-choices";
import { getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
import { formatMYR } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { formatEventHours } from "@/lib/promotion-campaigns/locations";

type Props = {
  registrationId: string;
  listingId: string;
  itemName: string;
  price: number;
  locationName: string;
  startsOn: string;
  endsOn: string;
  /** What the visitor taps to open the dialog (the stall page uses the whole product card). */
  trigger: (open: () => void) => ReactNode;
};

type Slot = { id: string; startsAt: string; endsAt: string; remaining: number };
type Availability = { slots: Slot[]; itemRemaining: number };

const KNOWN_ERRORS = ["EVENT_SOLD_OUT", "EVENT_SLOT_FULL", "EVENT_SLOT_INVALID", "EVENT_DATE_INVALID", "EVENT_ITEM_UNAVAILABLE", "WALLET_INSUFFICIENT"];

/** Reserve one event item: pickup date → time slot → quantity → pay (or confirm when free). */
export function EventReserveButton({ registrationId, listingId, itemName, price, locationName, startsOn, endsOn, trigger }: Props) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { currentUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const gate = useCustomerCapabilityGate();
  const firstDate = [getMalaysiaDateInputValue(), startsOn].sort()[1];
  const isFree = price === 0;

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(firstDate);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(false);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [methodId, setMethodId] = useState(PAYMENT_CHOICES[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const [contactEmail, setContactEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const choices = currentUser ? PAYMENT_CHOICES : PAYMENT_CHOICES.filter(choice => !["wallet", "wallet_split"].includes(choice.paymentMethod));
  const ended = firstDate > endsOn;
  const slot = availability?.slots.find((entry) => entry.id === slotId) ?? null;
  const maxQuantity = Math.max(0, Math.min(20, availability?.itemRemaining ?? 0, slot?.remaining ?? 20));

  async function loadAvailability(pickupDate: string) {
    setLoading(true);
    setError(null);
    setSlotId(null);
    setQuantity(1);
    try {
      const response = await fetch(`/api/customer/event-reservations/availability?registrationId=${registrationId}&date=${pickupDate}`, { cache: "no-store" });
      const body = await response.json() as { data?: { slots?: Slot[]; items?: { id: string; remaining: number }[] } };
      if (!response.ok || !body.data) throw new Error("availability");
      setAvailability({
        slots: body.data.slots ?? [],
        itemRemaining: body.data.items?.find((item) => item.id === listingId)?.remaining ?? 0,
      });
    } catch {
      setAvailability(null);
      setError(t("ui.reserve.errors.load"));
    } finally {
      setLoading(false);
    }
  }

  function openDialog(next: boolean) {
    setOpen(next);
    if (next && !ended) void loadAvailability(date);
  }

  function changeDate(value: string) {
    setDate(value);
    if (value >= firstDate && value <= endsOn) void loadAvailability(value);
  }

  async function reserve() {
    if (!gate(CUSTOMER_CAPABILITY.CHECKOUT, pathname)) return;
    if (!slot || quantity < 1 || quantity > maxQuantity) return;
    const choice = choices.find((entry) => entry.id === methodId) ?? choices[0];
    setSubmitting(true);
    setError(null);
    try {
      if (!currentUser) {
        const ready = await fetch("/api/guest/session", { method: "POST" });
        if (!ready.ok) throw new Error(t("guestCheckout.unavailable"));
      }
      const response = await fetch("/api/customer/event-reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: currentUser ? (contactPhone ? { email: currentUser.email, phone: contactPhone } : undefined) : { email: contactEmail, name: contactName || null, phone: contactPhone || null },
          listingId,
          pickupDate: date,
          slotId: slot.id,
          quantity,
          paymentMethod: isFree ? "free_reservation" : choice.paymentMethod,
          paymentProvider: isFree ? null : choice.paymentProvider,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (await gate.handleResponse(response, pathname)) return;
      const body = await response.json() as {
        data?: { checkout_session_id?: string; order_id?: string; status?: string; stripeUrl?: string; toyyibpayUrl?: string; simulatorUrl?: string; externalAmountSen?: number };
        error?: { code?: string; activeOrderId?: string };
      };
      if (!response.ok || !body.data?.order_id) {
        const code = body.error?.code ?? "";
        if (code === 'ACTIVE_CHECKOUT_EXISTS') {
          const id = body.error?.activeOrderId;
          setActiveOrderId(id && /^[0-9a-f-]{36}$/i.test(id) ? id : null);
          throw new Error(t('checkoutSafety.activeCheckout'));
        }
        throw new Error(KNOWN_ERRORS.includes(code) ? t(`ui.reserve.errors.${code}`) : t("ui.reserve.errors.generic"));
      }
      const redirect = body.data.stripeUrl ?? body.data.toyyibpayUrl ?? body.data.simulatorUrl;
      if (redirect) {
        window.location.assign(redirect);
        return;
      }
      if (body.data.status !== "paid") {
        // Wallet payments are settled right away, the same way the cart checkout does.
        const finalized = await fetch("/api/checkout/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutSessionId: body.data.checkout_session_id, outcome: "succeeded" }),
        });
        if (!finalized.ok) throw new Error(t("ui.reserve.errors.generic"));
      }
      router.push(`/customer/orders/${body.data.order_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ui.reserve.errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {trigger(() => openDialog(true))}
      <Dialog open={open} onOpenChange={openDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("ui.reserve.title", { item: itemName })}</DialogTitle>
            <DialogDescription>{t("ui.reserve.description", { location: locationName })}</DialogDescription>
          </DialogHeader>

            <div className="space-y-4 text-sm">
              <label className="block text-xs font-semibold text-muted-foreground">
                {t("ui.reserve.date")}
                <Input type="date" min={firstDate} max={endsOn} value={date} onChange={(e) => changeDate(e.target.value)} className="mt-1" />
              </label>

              <fieldset>
                <legend className="text-xs font-semibold text-muted-foreground">{t("ui.reserve.time")}</legend>
                {loading ? (
                  <p className="mt-2 flex items-center gap-2 text-muted-foreground"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> {t("ui.reserve.loading")}</p>
                ) : !availability || availability.slots.length === 0 ? (
                  <p className="mt-2 text-muted-foreground">{t("ui.reserve.noSlots")}</p>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {availability.slots.map((entry) => (
                      <label key={entry.id} className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-2.5 ${slotId === entry.id ? "border-primary bg-primary/5" : "border-border"} ${entry.remaining === 0 ? "cursor-not-allowed opacity-50" : ""}`}>
                        <span className="flex items-center gap-2">
                          <input type="radio" name="pickup-slot" value={entry.id} checked={slotId === entry.id} disabled={entry.remaining === 0} onChange={() => { setSlotId(entry.id); setQuantity(1); }} />
                          {formatEventHours(entry.startsAt, entry.endsAt, locale)}
                        </span>
                        <span className="text-xs text-muted-foreground">{entry.remaining === 0 ? t("ui.reserve.full") : t("ui.reserve.left", { count: entry.remaining })}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              {availability && availability.itemRemaining === 0 && <p className="text-destructive">{t("ui.reserve.soldOutDay")}</p>}

              <div className="flex items-end gap-3">
                <label className="block text-xs font-semibold text-muted-foreground">
                  {t("ui.reserve.quantity")}
                  <Input type="number" min={1} max={Math.max(1, maxQuantity)} value={quantity} onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="mt-1 w-24" />
                </label>
                <p className="pb-2 text-base font-bold text-foreground">{isFree ? t("ui.reserve.free") : formatMYR(price * quantity)}</p>
              </div>

              {!isFree && (
                <label className="block text-xs font-semibold text-muted-foreground">
                  {t("ui.reserve.payment")}
                  <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground">
                    {choices.map((choice) => <option key={choice.id} value={choice.id}>{t(choice.labelKey)}</option>)}
                  </select>
                </label>
              )}

              {!currentUser && <>
                <p className="text-xs text-muted-foreground">{t("guestCheckout.eventHint")}</p>
                <label className="block">{t("guestCheckout.email")}<Input type="email" autoComplete="email" required value={contactEmail} onChange={event => setContactEmail(event.target.value)} /></label>
                <label className="block">{t("guestCheckout.name")}<Input autoComplete="name" value={contactName} onChange={event => setContactName(event.target.value)} /></label>
              </>}
              {!isFree && choices.find(choice => choice.id === methodId)?.paymentProvider === "toyyibpay" && <label className="block">{t("guestCheckout.phone")}<InternationalPhoneInput id="checkout-contact-phone" value={contactPhone} onChange={setContactPhone} /></label>}
              <p className="text-xs text-muted-foreground">{t("ui.reserve.qrNote")}</p>
              {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">{error}</p>}
              {activeOrderId && <Button type="button" variant="outline" onClick={() => router.push(`/customer/orders/${activeOrderId}`)}>{t('checkoutSafety.reviewExisting')}</Button>}

              <Button type="button" className="w-full rounded-full" disabled={submitting || !slot || maxQuantity < 1 || quantity > maxQuantity} onClick={() => void reserve()}>
                <CalendarCheck size={16} aria-hidden="true" />
                {submitting ? t("ui.reserve.submitting") : isFree ? t("ui.reserve.confirmFree") : t("ui.reserve.pay", { amount: formatMYR(price * quantity) })}
              </Button>
            </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
