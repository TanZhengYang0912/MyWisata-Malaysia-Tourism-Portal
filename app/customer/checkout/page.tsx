"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CreditCard, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useCart } from "@/components/providers/cart";
import { getVoucherByCode } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { getCheckoutErrorMessage, type CheckoutErrorPayload } from "@/lib/checkout/errors";
import type { Voucher } from "@/backend/core/types";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY, resolveCustomerAccess } from "@/lib/auth/customer-capabilities";
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";

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
  paymentProvider: "tng_ewallet_simulator" | "grabpay_simulator" | "bank_transfer_simulator" | null;
  simulated?: boolean;
};

const ALL_METHODS = [
  { id: "stripe_card", labelKey: "strictMigration.checkout.methods.stripeCard", icon: CreditCard, paymentMethod: "stripe_card", paymentProvider: null },
  { id: "tng_ewallet", labelKey: "strictMigration.checkout.methods.tng", icon: Smartphone, paymentMethod: "ewallet", paymentProvider: "tng_ewallet_simulator", simulated: true },
  { id: "grabpay", labelKey: "strictMigration.checkout.methods.grabpay", icon: Smartphone, paymentMethod: "ewallet", paymentProvider: "grabpay_simulator", simulated: true },
  { id: "bank_transfer", labelKey: "strictMigration.checkout.methods.bankTransfer", icon: CreditCard, paymentMethod: "bank_transfer", paymentProvider: "bank_transfer_simulator", simulated: true },
  { id: "wallet", labelKey: "strictMigration.checkout.methods.wallet", icon: Wallet, paymentMethod: "wallet", paymentProvider: null },
  { id: "wallet_split", labelKey: "strictMigration.checkout.methods.walletSplit", icon: Wallet, paymentMethod: "wallet_split", paymentProvider: null },
] satisfies PaymentChoice[];

const METHODS: PaymentChoice[] = ALL_METHODS.filter(
  (choice) => !choice.simulated || process.env.NODE_ENV !== "production",
);

type WalletSummary = {
  topupSen: number;
  earningsSen: number;
};

export default function CheckoutPage() {
  const { t: tCustomer } = useTranslation("customer");
  const router = useRouter();
  const { currentUser } = useAuth();
  const gate = useCustomerCapabilityGate();
  const { selectedItems, selectedKeys, totals } = useCart();
  const [voucherCode, setVoucherCode] = useState<string | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<Voucher | undefined>(undefined);
  const [methodId, setMethodId] = useState("stripe_card");
  const [paying, setPaying] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [walletSummaryLoaded, setWalletSummaryLoaded] = useState(false);
  const checkoutAllowed = resolveCustomerAccess(currentUser, CUSTOMER_CAPABILITY.CHECKOUT) === "allowed";

  useEffect(() => {
    if (!checkoutAllowed) gate(CUSTOMER_CAPABILITY.CHECKOUT, "/customer/checkout");
  }, [checkoutAllowed, gate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setVoucherCode(params.get("voucher"));
    setClaimId(params.get("claim"));
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
    const sessionId = new URLSearchParams(window.location.search).get("stripe_session_id");
    if (!sessionId || !currentUser || !checkoutAllowed || selectedItems.length === 0 || paying) return;
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
  }, [checkoutAllowed, currentUser, selectedItems.length, selectedKeys, paying, router, voucherCode]);

  const { subtotal, discount, total } = totals(voucher);
  const totalSen = Math.round(total * 100);
  const walletSpendableSen = (walletSummary?.topupSen ?? 0) + (walletSummary?.earningsSen ?? 0);
  const walletInsufficient = walletSummaryLoaded && walletSpendableSen < totalSen;
  const selectedMethod = METHODS.find((choice) => choice.id === methodId) ?? METHODS[0]!;

  if (!currentUser) {
    return <div className="mx-auto max-w-lg px-4 py-10 sm:px-6"><GuestAccountEmptyState title={tCustomer("strictMigration.checkout.signInTitle")} description={tCustomer("strictMigration.checkout.signInDescription")} nextPath="/customer/checkout" /></div>;
  }

  if (!checkoutAllowed) {
    return <EmptyState title={tCustomer("ui.checkout.phoneRequired")} description={tCustomer("ui.checkout.verifyPhone")} action={<Link href="/customer/profile?next=%2Fcustomer%2Fcheckout" className="font-semibold text-primary hover:underline">{tCustomer("ui.checkout.continueVerification")}</Link>} />;
  }

  if (selectedItems.length === 0) {
    return <EmptyState title={tCustomer("ui.checkout.nothing")} description={tCustomer("ui.checkout.selectItems")} action={<Link href="/customer/cart" className="font-semibold text-primary hover:underline">{tCustomer("ui.actions.backToCart")}</Link>} />;
  }

  async function handlePay() {
    if (paying || !gate(CUSTOMER_CAPABILITY.CHECKOUT, "/customer/checkout")) return; // double-submit and tier guard
    setPaying(true);
    setCheckoutError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const prepareResponse = await fetch("/api/checkout/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          selectedKeys: [...selectedKeys],
          voucherCode,
          claimId,
          paymentMethod: selectedMethod.paymentMethod,
          paymentProvider: selectedMethod.paymentProvider,
          idempotencyKey,
        }),
      });
      const prepared = await prepareResponse.json() as { data?: { checkout_session_id?: string; order_id?: string; stripeUrl?: string; simulatorUrl?: string }; error?: CheckoutErrorPayload };
      if (!prepareResponse.ok || !prepared.data?.checkout_session_id) {
        throw new Error(getCheckoutErrorMessage(prepared.error));
      }
      if (prepared.data.stripeUrl) {
        window.location.href = prepared.data.stripeUrl;
        return;
      }
      if (prepared.data.simulatorUrl) {
        window.location.href = prepared.data.simulatorUrl;
        return;
      }
      if (selectedMethod.paymentMethod !== "wallet") {
        throw new Error("The payment provider did not return a secure payment action.");
      }
      const finalizeResponse = await fetch("/api/checkout/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId: prepared.data.checkout_session_id, outcome: "succeeded" }),
      });
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
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      <Link href="/customer/cart" className="mb-5 inline-flex items-center text-sm font-semibold text-primary hover:underline">← {tCustomer("ui.actions.backToCart")}</Link>
      <h1 className="text-2xl font-bold text-foreground mb-2 font-[family-name:var(--font-display)]">{tCustomer("ui.checkout.title")}</h1>
      <nav aria-label={tCustomer("ui.checkout.progress")} className="mb-5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Link href="/customer/cart" className="text-primary hover:underline">{tCustomer("ui.cart.title")}</Link>
        <span aria-hidden="true">→</span>
        <span className="text-foreground" aria-current="step">{tCustomer("ui.checkout.title")}</span>
        <span aria-hidden="true">→</span>
        <span>{tCustomer("ui.checkout.confirmation")}</span>
      </nav>
      <p className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5">
        <ShieldCheck size={13} /> {tCustomer("ui.checkout.stripeNotice")}
      </p>

      <div className="rounded-xl border border-border p-4 mb-6 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{tCustomer("ui.checkout.subtotal")}</span>
          <span className="font-semibold text-foreground font-[family-name:var(--font-mono)]">{MYR_CODE} {subtotal.toFixed(2)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{tCustomer("strictMigration.checkout.discountWithCode", { code: voucherCode })}</span>
            <span className="font-semibold text-primary font-[family-name:var(--font-mono)]">{tCustomer("strictMigration.cart.discountValue", { amount: `${MYR_CODE} ${discount.toFixed(2)}` })}</span>
          </div>
        )}
        <div className="flex justify-between text-base pt-2 border-t border-border">
          <span className="font-bold text-foreground">{tCustomer("ui.checkout.total")}</span>
          <span className="font-bold text-primary font-[family-name:var(--font-mono)]">{MYR_CODE} {total.toFixed(2)}</span>
        </div>
      </div>

      <p className="text-xs font-semibold text-muted-foreground mb-2">{tCustomer("ui.checkout.paymentMethod")}</p>
      <div className="space-y-2 mb-6">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={m.id === "wallet" && walletInsufficient}
             onClick={() => setMethodId(m.id)}
             className="w-full flex items-center gap-3 p-3 rounded-xl border text-left disabled:cursor-not-allowed disabled:opacity-50"
             style={{ borderColor: methodId === m.id ? "var(--primary)" : "var(--border)", backgroundColor: methodId === m.id ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}
          >
            <m.icon size={16} className="text-teal shrink-0" />
            <span className="text-sm font-medium text-foreground flex-1">{tCustomer(m.labelKey)}</span>
            {m.id === "wallet" && walletSummaryLoaded && (
              <span className="text-xs text-muted-foreground font-[family-name:var(--font-mono)]">
                {MYR_CODE} {(walletSpendableSen / 100).toFixed(2)}
              </span>
            )}
          </button>
        ))}
      </div>

      {walletInsufficient && (
        <p className="-mt-3 mb-6 text-xs text-muted-foreground">
          {tCustomer("ui.checkout.walletInsufficient")}
        </p>
      )}

      {checkoutError && (
        <div className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
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

       <Button className="h-12 w-full rounded-full" disabled={paying} onClick={() => void handlePay()}>
         {paying
           ? tCustomer("ui.states.preparingPayment")
           : selectedMethod.simulated
             ? tCustomer("ui.checkout.continueSimulator")
             : selectedMethod.paymentMethod === "wallet"
             ? tCustomer("ui.checkout.payWallet")
               : tCustomer("ui.checkout.continueStripe")}
       </Button>
    </div>
  );
}
