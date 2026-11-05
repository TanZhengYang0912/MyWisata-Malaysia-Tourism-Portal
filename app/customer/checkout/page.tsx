"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/shared/back-link";
import { AlertCircle, CalendarClock, ImageOff, ShieldCheck, Ticket } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useCart } from "@/components/providers/cart";
import { getBookingSlots, getOutlets, getVoucherByCode } from "@/backend/domains/catalogue";
import { resolveCartLinePrice } from "@/backend/core/helpers";
import { EmptyState } from "@/components/shared/empty-state";
import { ReferencePrice } from "@/components/shared/reference-price";
import { Input } from "@/components/ui/input";
import { InternationalPhoneInput } from "@/components/profile/international-phone-input";
import { Button } from "@/components/ui/button";
import { getCheckoutErrorCode, getCheckoutErrorRecovery, getCheckoutErrorTranslationKey, type CheckoutErrorCode, type CheckoutErrorPayload } from "@/lib/checkout/errors";
import { checkoutContactSchema } from "@/lib/checkout/contact";
import type { BookingSlot, Outlet, Voucher } from "@/backend/core/types";
import { formatMYRFromSen } from "@/lib/i18n/format";
import { formatStayRange } from "@/lib/customer/booking-view";
import { useReferenceCurrency } from "@/components/providers/reference-currency";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import {getSelectedOutletStock} from "@/lib/customer/outlet-shop";
import {getCartLineAvailability,resolveBookingSlotLookupStatus,type BookingSlotLookupState} from "@/lib/customer/cart-availability";
import { PAYMENT_CHOICES as METHODS, TOYYIBPAY_SANDBOX } from "@/lib/checkout/payment-choices";

// Affiliate attribution remains fire-and-forget and never blocks checkout.
function attributeCheckout(orderId: string) {
  fetch("/api/checkout/attribute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  }).catch(() => {});
}


type WalletSummary = {
  topupSen: number;
  earningsSen: number;
};

export default function CheckoutPage() {
  const { t: tCustomer } = useTranslation("customer");
  const { t: tCommon } = useTranslation("common");
  const { currency, snapshot } = useReferenceCurrency();
  const router = useRouter();
  const { currentUser, capabilities } = useAuth();
  const gate = useCustomerCapabilityGate();
  const { selectedItems, selectedKeys, activities = [], totals } = useCart();
  const [voucherCode, setVoucherCode] = useState<string | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<Voucher | undefined>(undefined);
  const [methodId, setMethodId] = useState("stripe_card");
  const [paying, setPaying] = useState(false);
  const [checkoutError, setCheckoutError] = useState<CheckoutErrorCode | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const checkoutAttemptRef = useRef<{ fingerprint: string; idempotencyKey: string } | null>(null);
  const checkoutRecovery = checkoutError ? getCheckoutErrorRecovery(checkoutError) : null;
  const checkoutErrorText = checkoutError ? tCustomer(getCheckoutErrorTranslationKey(checkoutError)) : null;
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [toyyibPayReturned, setToyyibPayReturned] = useState(false);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [walletSummaryLoaded, setWalletSummaryLoaded] = useState(false);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [slotsById, setSlotsById] = useState<Map<string, BookingSlot>>(new Map());
  const [bookingSlotsLoad,setBookingSlotsLoad]=useState<BookingSlotLookupState>({requestToken:null,status:"loaded"});
  const [foodModeByOutlet, setFoodModeByOutlet] = useState<Record<string, "dine_in" | "takeaway">>({});
  // null = untouched: a signed-in buyer sees their profile values, a guest starts empty.
  const [typedEmail, setContactEmail] = useState<string | null>(null);
  const [typedName, setContactName] = useState<string | null>(null);
  const [typedPhone, setContactPhone] = useState<string | null>(null);
  const contactEmail = typedEmail ?? currentUser?.email ?? "";
  const contactName = typedName ?? currentUser?.name ?? "";
  const contactPhone = typedPhone ?? currentUser?.phone ?? "";
  const checkoutAllowed = !currentUser || capabilities.checkout.allowed;
  const availableMethods = currentUser ? METHODS : METHODS.filter(choice => !["wallet", "wallet_split"].includes(choice.paymentMethod));

  useEffect(() => {
    getOutlets().then(setOutlets).catch(() => setOutlets([]));
  }, []);

  const bookingActivityIds = useMemo(
    () => [...new Set(selectedItems.filter((item) => item.slotId).map((item) => item.activityId))],
    [selectedItems],
  );
  const bookingActivityKey = bookingActivityIds.join(",");

  const bookingRequestToken=useMemo(()=>Symbol(bookingActivityKey),[bookingActivityKey]);
  const bookingSlotsStatus=resolveBookingSlotLookupStatus(bookingActivityIds.length>0,bookingRequestToken,bookingSlotsLoad);
  useEffect(() => {
    if (!bookingActivityKey) return;
    let active=true;
    Promise.all(bookingActivityKey.split(",").map(id=>getBookingSlots(id))).then(lists=>{
      if (!active) return;
      setSlotsById(new Map(lists.flat().map(slot=>[slot.id,slot])));
      setBookingSlotsLoad({requestToken:bookingRequestToken,status:"loaded"});
    }).catch(()=>{if(active) setBookingSlotsLoad({requestToken:bookingRequestToken,status:"error"});});
    return ()=>{active=false;};
  },[bookingActivityKey,bookingRequestToken]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // The query string initializes checkout state after the client can read the current URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoucherCode(params.get("voucher"));
    setClaimId(params.get("claim"));
    setToyyibPayReturned(params.get("toyyibpay_return") === "1");
  }, []);

  useEffect(() => {
    if (currentUser && voucherCode) getVoucherByCode(voucherCode).then(setVoucher);
  }, [currentUser, voucherCode]);

  useEffect(() => {
    if (!currentUser || !checkoutAllowed) return;
    let cancelled = false;
    fetch("/api/wallet/summary")
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("wallet_summary_failed")))
      .then((body: { data?: WalletSummary }) => {
        if (!cancelled) setWalletSummary(body.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setWalletSummary(null);
      })
      .finally(() => {
        if (!cancelled) setWalletSummaryLoaded(true);
      });
    return () => { cancelled = true; };
  }, [checkoutAllowed, currentUser]);

  useEffect(() => {
    // Live-found gap: `?stripe_session_id=` on its own already proves we're
    // returning from a real Stripe checkout for an order that /api/checkout/prepare
    // already created (its prepare_checkout RPC consumes the selected cart
    // items server-side as part of creating that order). By the time the
    // browser reloads fresh here, the cart is CORRECTLY empty — that's not
    // a reason to skip confirmation, it's proof the order was already made.
    // The old `selectedItems.length === 0` guard treated stale/empty cart
    // state as "nothing to confirm," so this effect silently never called
    // confirm-stripe (and therefore never attributed the affiliate referral
    // or generated a receipt) for exactly the common case: a single-item,
    // straight-to-checkout purchase, where the cart has nothing left over
    // once that one item is consumed.
    const sessionId = new URLSearchParams(window.location.search).get("stripe_session_id");
    if (!sessionId || !checkoutAllowed || paying) return;
    // Prevent duplicate confirmation while this one-time Stripe return is being verified.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaying(true);
    fetch("/api/checkout/confirm-stripe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stripeSessionId: sessionId }) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("stripe_confirmation_failed")))
      .then((body: { data?: { order_id?: string; status?: string } }) => {
        const orderId = body.data?.order_id;
        if (!orderId) throw new Error("stripe_order_missing");
        if (body.data?.status === 'payment_exception') { router.push(`/customer/orders/${orderId}`); return; }
        attributeCheckout(orderId);
        router.push(`/customer/orders/${orderId}`);
      })
      .catch(() => {
        setCheckoutError('PAYMENT_STATUS_UNCERTAIN');
        setPaying(false);
      });
  }, [checkoutAllowed, currentUser, paying, router]);

  const slotPrices=new Map([...slotsById.values()].flatMap(slot=>slot.priceOverride === undefined ? [] : [[slot.id,slot.priceOverride]]));
  const pricingReady=bookingSlotsStatus === "loaded" && selectedItems.every(item=>{
    const activity=activities.find(candidate=>candidate.id === item.activityId);
    return Boolean(activity && resolveCartLinePrice(activity,item,{now:new Date(),productIds:selectedItems.map(line=>line.activityId),slotPriceOverride:item.slotId ? slotPrices.get(item.slotId) : undefined}).available && getCartLineAvailability({slotId:item.slotId,slot:item.slotId ? slotsById.get(item.slotId) : undefined,slotLookupStatus:bookingSlotsStatus,quantity:item.qty,stockLimit:activity.requiresBooking ? undefined : getSelectedOutletStock(activity,item.outletId ?? activity.outletId)}).available);
  });
  const { subtotal, discount, total } = totals(currentUser ? voucher : undefined,slotPrices);
  const totalSen = Math.round(total * 100);
  const isFreeReservation = pricingReady && total === 0;
  const walletSpendableSen = (walletSummary?.topupSen ?? 0) + (walletSummary?.earningsSen ?? 0);
  const walletInsufficient = !isFreeReservation && walletSummaryLoaded && walletSpendableSen < totalSen;
  const selectedMethod = availableMethods.find((choice) => choice.id === methodId) ?? availableMethods[0]!;
  const foodOutletGroups = useMemo(() => {
    const ids = new Set<string>();
    for (const item of selectedItems) {
      const activity = activities.find((candidate) => candidate.id === item.activityId);
      if (activity?.categorySlug?.toLowerCase() === "food") ids.add(item.outletId ?? activity.outletId);
    }
    return [...ids].map((outletId) => ({ outletId, outlet: outlets.find((outlet) => outlet.id === outletId) }));
  }, [activities, outlets, selectedItems]);
  const foodModeMissing = foodOutletGroups.some(({ outletId, outlet }) =>
    !outlet || !foodModeByOutlet[outletId] || !outlet.foodServiceModes?.includes(foodModeByOutlet[outletId]!),
  );
  const isStayItem = (item: (typeof selectedItems)[number]) =>
    Boolean(item.slotId) && activities.find((candidate) => candidate.id === item.activityId)?.categorySlug === "accommodation";
  const showPhone = selectedMethod.paymentProvider === "toyyibpay";
  const myDate = (ms: number) => new Date(ms).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" });

  if (toyyibPayReturned) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 shrink-0 text-primary" size={22} aria-hidden="true" />
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {tCustomer("ui.checkout.toyyibpayAwaitingTitle")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {tCustomer("ui.checkout.toyyibpayAwaitingDescription")}
              </p>
              <Link href="/customer/orders" className="mt-4 inline-flex font-semibold text-primary hover:underline">
                {tCustomer("ui.checkout.viewOrders")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedItems.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <EmptyState
          title={tCustomer("ui.checkout.nothing")}
          description={tCustomer("ui.checkout.selectItems")}
          action={
            <Link href="/customer/cart" className="font-semibold text-primary hover:underline">
              {tCustomer("ui.actions.backToCart")}
            </Link>
          }
        />
      </div>
    );
  }

  function reportCheckoutError(payload: CheckoutErrorPayload) {
    const code = getCheckoutErrorCode(payload);
    setCheckoutError(code);
    const recovery = getCheckoutErrorRecovery(code);
    const input = recovery === 'email' ? emailInputRef.current : recovery === 'name' ? nameInputRef.current : recovery === 'phone' ? document.getElementById('checkout-contact-phone') : null;
    input?.focus();
    input?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }

  async function findCurrentGuestOrder() {
    if (currentUser) return;
    try {
      const response = await fetch('/api/guest/orders/current', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json() as { data?: { orderId?: string } | null };
      const orderId = payload.data?.orderId;
      if (orderId && /^[0-9a-f-]{36}$/i.test(orderId)) setActiveOrderId(orderId);
    } catch {
      // Keep the safe email-based recovery action available when session lookup is unavailable.
    }
  }

  async function handlePay() {
    if (paying || !pricingReady || !gate(CUSTOMER_CAPABILITY.CHECKOUT, "/customer/checkout")) return;
    const contactInput = { email: contactEmail.trim(), name: contactName.trim() || null, phone: contactPhone.trim() || null };
    const contactValidation = checkoutContactSchema.safeParse(contactInput);
    if (!contactValidation.success) {
      reportCheckoutError({ code: 'VALIDATION_FAILED', details: contactValidation.error.flatten() });
      return;
    }
    if (showPhone && !contactValidation.data.phone) {
      reportCheckoutError('CONTACT_PHONE_REQUIRED');
      return;
    }
    if (foodModeMissing) {
      reportCheckoutError('FOOD_SERVICE_MODE_REQUIRED');
      return;
    }
    setPaying(true);
    setCheckoutError(null);
    try {
      const paymentMethod = isFreeReservation ? "free_reservation" : selectedMethod.paymentMethod;
      const paymentProvider = isFreeReservation ? null : selectedMethod.paymentProvider;
      const checkoutRequest = {
        selectedKeys: [...selectedKeys],
        voucherCode: currentUser ? voucherCode : null,
        claimId: currentUser ? claimId : null,
        contact: contactValidation.data,
        foodServiceModes: foodOutletGroups.map(({ outletId }) => ({ outletId, mode: foodModeByOutlet[outletId]! })),
        paymentMethod,
        paymentProvider,
      };
      const fingerprint = JSON.stringify(checkoutRequest);
      if (checkoutAttemptRef.current?.fingerprint !== fingerprint) {
        checkoutAttemptRef.current = { fingerprint, idempotencyKey: crypto.randomUUID() };
      }
      const idempotencyKey = checkoutAttemptRef.current.idempotencyKey;

      if (!currentUser) {
        const ready = await fetch("/api/guest/session", { method: "POST" });
        if (!ready.ok) {
          reportCheckoutError(ready.status === 429 ? 'CHECKOUT_RATE_LIMITED' : 'GUEST_SESSION_UNAVAILABLE');
          return;
        }
      }
      const prepareResponse = await fetch("/api/checkout/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ ...checkoutRequest, idempotencyKey }),
      });
      if (await gate.handleResponse(prepareResponse, "/customer/checkout")) {
        setPaying(false);
        return;
      }
      const prepared = await prepareResponse.json() as { data?: { checkout_session_id?: string; order_id?: string; stripeUrl?: string; simulatorUrl?: string; toyyibpayUrl?: string; externalAmountSen?: number }; error?: CheckoutErrorPayload };
      if (!prepareResponse.ok || !prepared.data?.checkout_session_id) {
        const pendingId = typeof prepared.error === 'object' && prepared.error?.code === 'ACTIVE_CHECKOUT_EXISTS' ? prepared.error.activeOrderId : null;
        setActiveOrderId(pendingId && /^[0-9a-f-]{36}$/i.test(pendingId) ? pendingId : null);
        const code = getCheckoutErrorCode(prepared.error);
        reportCheckoutError(prepareResponse.status === 429 ? 'CHECKOUT_RATE_LIMITED' : code === 'CHECKOUT_FAILED' && prepareResponse.status >= 500 ? 'CHECKOUT_SERVICE_UNAVAILABLE' : code);
        return;
      }
      if (isFreeReservation) {
        if (!prepared.data.order_id) { reportCheckoutError('CHECKOUT_FAILED'); return; }
        if (currentUser) attributeCheckout(prepared.data.order_id);
        router.push(`/customer/orders/${prepared.data.order_id}`);
        return;
      }
      if (prepared.data.stripeUrl) {
        window.location.assign(prepared.data.stripeUrl);
        return;
      }
      if (prepared.data.toyyibpayUrl) {
        window.location.assign(prepared.data.toyyibpayUrl);
        return;
      }
      if (prepared.data.simulatorUrl) {
        window.location.assign(prepared.data.simulatorUrl);
        return;
      }
      const walletFinalization =
        selectedMethod.paymentMethod === "wallet" ||
        (selectedMethod.paymentMethod === "wallet_split" && prepared.data.externalAmountSen === 0);
      if (!walletFinalization) {
        reportCheckoutError('PAYMENT_STATUS_UNCERTAIN');
        return;
      }
      const finalizeResponse = await fetch("/api/checkout/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId: prepared.data.checkout_session_id, outcome: "succeeded" }),
      });
      if (await gate.handleResponse(finalizeResponse, "/customer/checkout")) {
        setPaying(false);
        return;
      }
      const finalized = await finalizeResponse.json() as { data?: { order_id?: string }; error?: CheckoutErrorPayload };
      if (!finalizeResponse.ok || !finalized.data?.order_id) {
        reportCheckoutError(finalized.error);
        return;
      }
      attributeCheckout(finalized.data.order_id);
      router.push(`/customer/orders/${finalized.data.order_id}`);
    } catch (err) {
      reportCheckoutError(err instanceof TypeError ? 'CHECKOUT_CONNECTION_FAILED' : 'CHECKOUT_FAILED');
      await findCurrentGuestOrder();
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <BackLink fallbackHref="/customer/cart" sameOriginOnly className="mb-4 inline-flex items-center text-sm font-semibold text-primary hover:underline">
        ← {tCommon("actions.back")}
      </BackLink>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground font-[family-name:var(--font-display)]">
          {tCustomer("ui.checkout.title")}
        </h1>
        <nav aria-label={tCustomer("ui.checkout.progress")} className="mt-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Link href="/customer/cart" className="text-primary hover:underline">{tCustomer("ui.cart.title")}</Link>
          <span aria-hidden="true">→</span>
          <span className="text-foreground" aria-current="step">{tCustomer("ui.checkout.title")}</span>
          <span aria-hidden="true">→</span>
          <span>{tCustomer("ui.checkout.confirmation")}</span>
        </nav>
      </div>

      <section className="mb-6 space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">{!currentUser ? tCustomer("guestCheckout.title") : tCustomer("ui.property.contactDetails")}</h2>
        <p className="text-sm text-muted-foreground">{currentUser ? tCustomer("ui.property.prefilledHint") : tCustomer("guestCheckout.hint")}</p>
        <label className="block text-sm">{tCustomer("guestCheckout.email")}<Input ref={emailInputRef} id="checkout-contact-email" type="email" autoComplete="email" required aria-invalid={checkoutRecovery === 'email'} aria-describedby={checkoutRecovery === 'email' ? 'checkout-email-error' : undefined} value={contactEmail} onChange={event => { setContactEmail(event.target.value); if (checkoutRecovery === 'email') setCheckoutError(null); }} /></label>
        {checkoutRecovery === 'email' && <p id="checkout-email-error" role="alert" className="text-sm text-destructive">{checkoutErrorText}</p>}
        <label className="block text-sm">{tCustomer("guestCheckout.name")}<Input ref={nameInputRef} id="checkout-contact-name" autoComplete="name" aria-invalid={checkoutRecovery === 'name'} aria-describedby={checkoutRecovery === 'name' ? 'checkout-name-error' : undefined} value={contactName} onChange={event => { setContactName(event.target.value); if (checkoutRecovery === 'name') setCheckoutError(null); }} /></label>
        {checkoutRecovery === 'name' && <p id="checkout-name-error" role="alert" className="text-sm text-destructive">{checkoutErrorText}</p>}
        {(showPhone || checkoutRecovery === 'phone' || typedPhone !== null) && <label className="block text-sm">{tCustomer("guestCheckout.phone")}<InternationalPhoneInput id="checkout-contact-phone" value={contactPhone} error={checkoutRecovery === 'phone'} ariaDescribedBy={checkoutRecovery === 'phone' ? 'checkout-phone-error' : undefined} onChange={value => { setContactPhone(value); if (checkoutRecovery === 'phone') setCheckoutError(null); }} /></label>}
        {checkoutRecovery === 'phone' && <p id="checkout-phone-error" role="alert" className="text-sm text-destructive">{checkoutErrorText}</p>}
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Column */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
          {foodOutletGroups.length > 0 && (
            <section className="rounded-2xl border border-primary/25 bg-primary/5 p-5 shadow-sm sm:p-6" aria-labelledby="food-service-mode-heading">
              <h2 id="food-service-mode-heading" className="text-base font-bold text-foreground">{tCustomer("ui.checkout.foodServiceModeTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tCustomer("ui.checkout.foodServiceModeDescription")}</p>
              <div className="mt-4 space-y-4">
                {foodOutletGroups.map(({ outletId, outlet }) => {
                  const supportedModes = outlet?.foodServiceModes ?? [];
                  return (
                    <fieldset key={outletId} className="rounded-xl border border-border bg-card p-4">
                      <legend className="px-1 text-sm font-semibold text-foreground">{outlet?.name ?? tCustomer("ui.checkout.foodServiceOutletUnavailable")}</legend>
                      <div className="mt-1 flex flex-wrap gap-4">
                        {supportedModes.map((mode) => (
                          <label key={mode} className="inline-flex min-h-10 items-center gap-2 text-sm text-foreground">
                            <input
                              type="radio"
                              name={`food-mode-${outletId}`}
                              value={mode}
                              checked={foodModeByOutlet[outletId] === mode}
                              onChange={() => setFoodModeByOutlet((current) => ({ ...current, [outletId]: mode }))}
                              className="h-4 w-4 accent-primary"
                            />
                            {mode === "dine_in" ? tCustomer("ui.checkout.foodModes.dine_in") : tCustomer("ui.checkout.foodModes.takeaway")}
                          </label>
                        ))}
                      </div>
                      {supportedModes.length === 0 && <p className="mt-2 text-xs text-destructive">{tCustomer("ui.checkout.foodServiceModeUnavailable")}</p>}
                    </fieldset>
                  );
                })}
              </div>
            </section>
          )}
          {/* Reservation Items Card */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
              <Ticket size={18} className="text-primary" />
              <span>{tCustomer("ui.checkout.itemsToReserve", "Items in Reservation")} ({selectedItems.length})</span>
            </h2>
            <div className="space-y-3">
              {selectedItems.map((item) => {
                const activity = activities.find((candidate) => candidate.id === item.activityId);
                const outlet = outlets.find((candidate) => candidate.id === (item.outletId ?? activity?.outletId));
                const variant = activity?.variants.find((candidate) => candidate.id === item.variantId);
                const slot = item.slotId ? slotsById.get(item.slotId) : undefined;
                const resolved=activity ? resolveCartLinePrice(activity,item,{now:new Date(),productIds:selectedItems.map(line=>line.activityId),slotPriceOverride:slot?.priceOverride}) : null;
                const price=resolved?.available ? resolved.unitPrice : 0;
                const lineTotal = price * item.qty;
                return (
                  <div key={`${item.activityId}-${item.variantId}-${item.slotId ?? ""}`} className="flex items-start gap-4 p-4 rounded-xl border border-border bg-secondary/15 transition-colors">
                    {activity?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={activity.image} alt={activity.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                        <ImageOff size={20} strokeWidth={1.5} aria-hidden="true" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="break-words whitespace-normal text-sm font-bold text-foreground">{activity?.name ?? tCustomer("ui.states.loading")}</h3>
                        <span className="text-sm font-bold text-foreground font-[family-name:var(--font-mono)] shrink-0">
                          {!resolved?.available || (item.slotId && bookingSlotsStatus !== "loaded") ? tCustomer("ui.cart.checkingAvailability") : <ReferencePrice amountMYR={lineTotal} />}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{outlet?.name ?? ""} {variant?.label ? `· ${variant.label}` : ""}</p>
                      {slot && isStayItem(item) ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-border bg-card p-2.5 text-xs">
                          <div>
                            <p className="font-semibold uppercase tracking-wide text-muted-foreground">{tCustomer("ui.property.checkIn")}</p>
                            <p className="font-semibold text-foreground">{myDate(Date.parse(slot.startsAt))}</p>
                          </div>
                          <div>
                            <p className="font-semibold uppercase tracking-wide text-muted-foreground">{tCustomer("ui.property.checkOut")}</p>
                            <p className="font-semibold text-foreground">{myDate(Date.parse(slot.endsAt ?? slot.startsAt) + ((item.nights ?? 1) - 1) * 86_400_000)}</p>
                          </div>
                        </div>
                      ) : slot && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                          <CalendarClock size={13} className="text-primary" />
                          <span>{(item.nights ?? 1) > 1 || activity?.categorySlug === "accommodation" ? `${formatStayRange(slot.startsAt, item.nights ?? 1)} · ${tCustomer("ui.property.nightsSummary", { count: item.nights ?? 1 })}` : new Date(slot.startsAt).toLocaleString("en-MY", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                          {isStayItem(item) ? `${tCustomer("ui.property.nightsSummary", { count: item.nights ?? 1 })} · ${tCustomer("ui.property.roomsCount", { count: item.qty })}` : `${tCustomer('ui.booking.qtyLabel')} ${item.qty}`}
                        </span>
                        {pricingReady && lineTotal === 0 && (
                          <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-300">
                            {tCustomer('ui.booking.freeAdmission')}
                          </span>
                        )}
                      </div>
                      {resolved?.available && !(item.slotId && bookingSlotsStatus !== "loaded") && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          <span className="sr-only">{tCustomer("ui.checkout.linePriceBreakdown")}: </span>
                          <ReferencePrice amountMYR={price} /> × {item.qty} = <ReferencePrice amountMYR={lineTotal} />
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Payment or Free Reservation Card */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            {isFreeReservation ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <Ticket size={20} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {tCustomer("ui.checkout.freeReservationTitle")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {tCustomer("ui.checkout.freeReservationNotice")}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-muted-foreground mb-3">{tCustomer("ui.checkout.paymentMethod")}</p>
                <div className="space-y-2 mb-4">
                  {availableMethods.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={m.id === "wallet" && walletInsufficient}
                      onClick={() => setMethodId(m.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border text-left disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                      style={{ borderColor: methodId === m.id ? "var(--primary)" : "var(--border)", backgroundColor: methodId === m.id ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}
                    >
                      <m.icon size={16} className="text-teal shrink-0" />
                      <span className="text-sm font-medium text-foreground flex-1">{tCustomer(m.labelKey)}</span>
                      {m.id === "wallet" && walletSummaryLoaded && (
                        <span className="text-xs text-muted-foreground font-[family-name:var(--font-mono)]">
                          {formatMYRFromSen(walletSpendableSen)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {walletInsufficient && (
                  <p className="text-xs text-muted-foreground mb-4">
                    {tCustomer("ui.checkout.walletInsufficient")}
                  </p>
                )}

                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck size={13} /> {tCustomer("ui.checkout.paymentNotice")}
                </p>
              </>
            )}
          </section>

          {checkoutError && !['email', 'phone', 'name'].includes(checkoutRecovery ?? '') && (
            <div role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{checkoutErrorText}</span>
              </div>
              {activeOrderId && <Button type="button" variant="outline" className="mt-2" onClick={() => router.push(`/customer/orders/${activeOrderId}`)}>{tCustomer('checkoutSafety.reviewExisting')}</Button>}
              {checkoutRecovery === 'orders' && !activeOrderId && <Button type="button" variant="outline" className="mt-2" onClick={() => router.push(currentUser ? '/customer/orders' : '/customer/orders/access')}>{tCustomer('checkoutErrors.reviewOrder')}</Button>}
              {checkoutRecovery === 'cart' && <button
                type="button"
                onClick={() => router.push("/customer/cart")}
                className="mt-2 pl-6 text-xs font-semibold underline underline-offset-2"
              >
                {tCustomer("strictMigration.checkout.returnToCart")}
              </button>}
              {checkoutRecovery === 'wallet' && (
                <div className="mt-3 flex gap-2 pl-6">
                  <Button type="button" size="sm" onClick={() => router.push("/customer/wallet?topup=1")}>{tCustomer("ui.wallet.topUp")}</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setMethodId("stripe_card"); setCheckoutError(null); }}>{tCustomer("strictMigration.checkout.payByCard")}</Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Column */}
        <div className="lg:col-span-5 xl:col-span-4 sticky top-24 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-foreground">
              {tCustomer("ui.checkout.orderSummary", "Order Summary")}
            </h2>
            {!pricingReady && <p role="status" className="text-sm text-muted-foreground">{tCustomer(bookingSlotsStatus === "loading" ? "ui.cart.checkingAvailability" : "ui.cart.availabilityCheckFailed")}</p>}
            <div className="space-y-2 border-b border-border pb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tCustomer("ui.checkout.subtotal")}</span>
                <ReferencePrice amountMYR={subtotal} className="font-semibold text-foreground font-[family-name:var(--font-mono)]" />
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{tCustomer("strictMigration.checkout.discountWithCode", { code: voucherCode })}</span>
                  <span className="font-semibold text-primary font-[family-name:var(--font-mono)]">−<ReferencePrice amountMYR={discount} /></span>
                </div>
              )}
            </div>
            <div className="flex justify-between text-lg font-bold">
              <span className="text-foreground">{tCustomer("ui.checkout.total")}</span>
              <ReferencePrice amountMYR={total} showSettlementMYR className="text-primary font-[family-name:var(--font-mono)]" />
            </div>

            {!isFreeReservation && (
              <p className="text-xs font-semibold text-foreground">{tCommon("currency.chargedInMYR")}</p>
            )}
            {currency !== "MYR" && snapshot && (
              <p className="text-xs leading-5 text-muted-foreground">
                {tCommon("currency.referenceOnly")} {tCommon("currency.rateDate", { date: snapshot.date })}
              </p>
            )}

            <Button className="h-12 w-full rounded-full text-base font-semibold shadow-md" disabled={paying || Boolean(activeOrderId) || foodModeMissing || !pricingReady} onClick={() => void handlePay()}>
              {paying
                ? tCustomer("ui.states.preparingPayment")
                : isFreeReservation
                ? tCustomer("ui.checkout.reserveFreeSpot")
                : selectedMethod.simulated
                ? tCustomer("ui.checkout.continueSimulator")
                : selectedMethod.paymentProvider === "toyyibpay"
                ? tCustomer(TOYYIBPAY_SANDBOX ? "ui.checkout.continueToyyibPaySandbox" : "ui.checkout.continueToyyibPay")
                : selectedMethod.paymentMethod === "wallet"
                ? tCustomer("ui.checkout.payWallet")
                : tCustomer("ui.checkout.continueStripe")}
            </Button>

            <div className="pt-2 border-t border-border/60 text-xs text-muted-foreground space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-300 shrink-0" />
                <span>{isFreeReservation ? tCustomer("ui.checkout.instantAllocation", "Instant slot reservation · No payment required") : "Secure encryption and fraud protection"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
