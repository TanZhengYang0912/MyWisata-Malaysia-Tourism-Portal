"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CalendarClock, CreditCard, ImageOff, ShieldCheck, Smartphone, Ticket, Wallet } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useCart } from "@/components/providers/cart";
import { getActivities, getBookingSlots, getOutlets, getVoucherByCode } from "@/backend/domains/catalogue";
import { unitPrice } from "@/backend/core/helpers";
import { EmptyState } from "@/components/shared/empty-state";
import { ReferencePrice } from "@/components/shared/reference-price";
import { Button } from "@/components/ui/button";
import { getCheckoutErrorMessage, type CheckoutErrorPayload } from "@/lib/checkout/errors";
import type { Activity, BookingSlot, Outlet, Voucher } from "@/backend/core/types";
import { formatMYRFromSen } from "@/lib/i18n/format";
import { useReferenceCurrency } from "@/components/providers/reference-currency";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";

// Affiliate attribution remains fire-and-forget and never blocks checkout.
function attributeCheckout(orderId: string) {
  fetch("/api/checkout/attribute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  }).catch(() => {});
}

type PaymentChoice = {
  id: string;
  labelKey: string;
  icon: typeof CreditCard;
  paymentMethod: "stripe_card" | "ewallet" | "bank_transfer" | "wallet" | "wallet_split";
  paymentProvider: "tng_ewallet_simulator" | "grabpay_simulator" | "bank_transfer_simulator" | "toyyibpay" | null;
  simulated?: boolean;
};

const TOYYIBPAY_ENABLED = process.env.NEXT_PUBLIC_TOYYIBPAY_ENABLED === "true";
const TOYYIBPAY_SANDBOX = process.env.NEXT_PUBLIC_TOYYIBPAY_ENV !== "production";

const ALL_METHODS = [
  { id: "stripe_card", labelKey: "strictMigration.checkout.methods.stripeCard", icon: CreditCard, paymentMethod: "stripe_card", paymentProvider: null },
  { id: "tng_ewallet", labelKey: "strictMigration.checkout.methods.tng", icon: Smartphone, paymentMethod: "ewallet", paymentProvider: "tng_ewallet_simulator", simulated: true },
  { id: "grabpay", labelKey: "strictMigration.checkout.methods.grabpay", icon: Smartphone, paymentMethod: "ewallet", paymentProvider: "grabpay_simulator", simulated: true },
  { id: "bank_transfer", labelKey: "strictMigration.checkout.methods.bankTransfer", icon: CreditCard, paymentMethod: "bank_transfer", paymentProvider: "bank_transfer_simulator", simulated: true },
  { id: "toyyibpay", labelKey: TOYYIBPAY_SANDBOX ? "strictMigration.checkout.methods.toyyibpaySandbox" : "strictMigration.checkout.methods.toyyibpay", icon: CreditCard, paymentMethod: "bank_transfer", paymentProvider: "toyyibpay" },
  { id: "wallet", labelKey: "strictMigration.checkout.methods.wallet", icon: Wallet, paymentMethod: "wallet", paymentProvider: null },
  { id: "wallet_split", labelKey: "strictMigration.checkout.methods.walletSplit", icon: Wallet, paymentMethod: "wallet_split", paymentProvider: null },
] satisfies PaymentChoice[];

const METHODS: PaymentChoice[] = ALL_METHODS.filter(
  (choice) => (choice.id !== "toyyibpay" || TOYYIBPAY_ENABLED)
    && (!choice.simulated || process.env.NODE_ENV !== "production"),
);

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
  const { selectedItems, selectedKeys, totals } = useCart();
  const [voucherCode, setVoucherCode] = useState<string | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<Voucher | undefined>(undefined);
  const [methodId, setMethodId] = useState("stripe_card");
  const [paying, setPaying] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [toyyibPayReturned, setToyyibPayReturned] = useState(false);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [walletSummaryLoaded, setWalletSummaryLoaded] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [slotsById, setSlotsById] = useState<Map<string, BookingSlot>>(new Map());
  const checkoutAllowed = capabilities.checkout.allowed;

  useEffect(() => {
    getActivities().then(setActivities).catch(() => setActivities([]));
    getOutlets().then(setOutlets).catch(() => setOutlets([]));
  }, []);

  const bookingActivityIds = useMemo(
    () => [...new Set(selectedItems.filter((item) => item.slotId).map((item) => item.activityId))],
    [selectedItems],
  );
  const bookingActivityKey = bookingActivityIds.join(",");

  useEffect(() => {
    if (bookingActivityIds.length === 0) return;
    Promise.all(bookingActivityIds.map((id) => getBookingSlots(id))).then((lists) => {
      setSlotsById(new Map(lists.flat().map((slot) => [slot.id, slot])));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingActivityKey]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setVoucherCode(params.get("voucher"));
    setClaimId(params.get("claim"));
    setToyyibPayReturned(params.get("toyyibpay_return") === "1");
  }, []);

  useEffect(() => {
    if (voucherCode) getVoucherByCode(voucherCode).then(setVoucher);
  }, [voucherCode]);

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
    if (!sessionId || !currentUser || !checkoutAllowed || paying) return;
    setPaying(true);
    fetch("/api/checkout/confirm-stripe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stripeSessionId: sessionId }) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("stripe_confirmation_failed")))
      .then((body: { data?: { order_id?: string } }) => {
        const orderId = body.data?.order_id;
        if (!orderId) throw new Error("stripe_order_missing");
        attributeCheckout(orderId);
        fetch("/api/orders/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }), keepalive: true });
        router.push(`/customer/orders/${orderId}`);
      })
      .catch(() => {
        setCheckoutError("Stripe payment confirmation could not be completed. Please check your order status or try again.");
        setPaying(false);
      });
  }, [checkoutAllowed, currentUser, paying, router]);

  const { subtotal, discount, total } = totals(voucher);
  const totalSen = Math.round(total * 100);
  const isFreeReservation = total === 0;
  const walletSpendableSen = (walletSummary?.topupSen ?? 0) + (walletSummary?.earningsSen ?? 0);
  const walletInsufficient = !isFreeReservation && walletSummaryLoaded && walletSpendableSen < totalSen;
  const selectedMethod = METHODS.find((choice) => choice.id === methodId) ?? METHODS[0]!;

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

  async function handlePay() {
    if (paying || !gate(CUSTOMER_CAPABILITY.CHECKOUT, "/customer/checkout")) return;
    setPaying(true);
    setCheckoutError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const isFreeReservation = total === 0;
      const paymentMethod = isFreeReservation ? "free_reservation" : selectedMethod.paymentMethod;
      const paymentProvider = isFreeReservation ? null : selectedMethod.paymentProvider;

      const prepareResponse = await fetch("/api/checkout/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          selectedKeys: [...selectedKeys],
          voucherCode,
          claimId,
          paymentMethod,
          paymentProvider,
          idempotencyKey,
        }),
      });
      if (await gate.handleResponse(prepareResponse, "/customer/checkout")) {
        setPaying(false);
        return;
      }
      const prepared = await prepareResponse.json() as { data?: { checkout_session_id?: string; order_id?: string; stripeUrl?: string; simulatorUrl?: string; toyyibpayUrl?: string; externalAmountSen?: number }; error?: CheckoutErrorPayload };
      if (!prepareResponse.ok || !prepared.data?.checkout_session_id) {
        throw new Error(getCheckoutErrorMessage(prepared.error));
      }
      if (isFreeReservation) {
        if (!prepared.data.order_id) throw new Error("Order creation failed");
        attributeCheckout(prepared.data.order_id);
        fetch("/api/orders/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: prepared.data.order_id }), keepalive: true });
        router.push(`/customer/orders/${prepared.data.order_id}`);
        return;
      }
      if (prepared.data.stripeUrl) {
        window.location.href = prepared.data.stripeUrl;
        return;
      }
      if (prepared.data.toyyibpayUrl) {
        window.location.href = prepared.data.toyyibpayUrl;
        return;
      }
      if (prepared.data.simulatorUrl) {
        window.location.href = prepared.data.simulatorUrl;
        return;
      }
      const walletFinalization =
        selectedMethod.paymentMethod === "wallet" ||
        (selectedMethod.paymentMethod === "wallet_split" && prepared.data.externalAmountSen === 0);
      if (!walletFinalization) {
        throw new Error("The payment provider did not return a secure payment action.");
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
      if (!finalizeResponse.ok || !finalized.data?.order_id) throw new Error(getCheckoutErrorMessage(finalized.error));
      attributeCheckout(finalized.data.order_id);
      fetch("/api/orders/receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: finalized.data.order_id }), keepalive: true });
      router.push(`/customer/orders/${finalized.data.order_id}`);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : getCheckoutErrorMessage(err as CheckoutErrorPayload));
      setPaying(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/customer/cart" className="mb-4 inline-flex items-center text-sm font-semibold text-primary hover:underline">
        ← {tCustomer("ui.actions.backToCart")}
      </Link>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Column */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-6">
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
                const price = item.priceOverride ?? (activity ? unitPrice(activity, item.variantId, item.qty) : 0);
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
                        <h3 className="text-sm font-bold text-foreground truncate">{activity?.name ?? tCustomer("ui.states.loading")}</h3>
                        <span className="text-sm font-bold text-foreground font-[family-name:var(--font-mono)] shrink-0">
                          {lineTotal === 0 ? "RM0.00" : <ReferencePrice amountMYR={lineTotal} />}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{outlet?.name ?? ""} {variant?.label ? `· ${variant.label}` : ""}</p>
                      {slot && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1.5">
                          <CalendarClock size={13} className="text-primary" />
                          <span>{new Date(slot.startsAt).toLocaleString("en-MY", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                          {tCustomer('ui.booking.qtyLabel')} {item.qty}
                        </span>
                        {lineTotal === 0 && (
                          <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600">
                            {tCustomer('ui.booking.freeAdmission')}
                          </span>
                        )}
                      </div>
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
                  {METHODS.map((m) => (
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

          {checkoutError && (
            <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{checkoutError}</span>
              </div>
              <button
                type="button"
                onClick={() => router.push("/customer/cart")}
                className="mt-2 pl-6 text-xs font-semibold underline underline-offset-2"
              >
                {tCustomer("strictMigration.checkout.returnToCart")}
              </button>
              {checkoutError.includes("Wallet balance is no longer sufficient") && (
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

            <Button className="h-12 w-full rounded-full text-base font-semibold shadow-md" disabled={paying} onClick={() => void handlePay()}>
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
                <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                <span>{isFreeReservation ? tCustomer("ui.checkout.instantAllocation", "Instant slot reservation · No payment required") : "Secure encryption and fraud protection"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
