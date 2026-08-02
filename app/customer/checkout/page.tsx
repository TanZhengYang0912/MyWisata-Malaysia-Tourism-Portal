"use client";

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

// Affiliate attribution remains fire-and-forget and never blocks checkout.
function attributeCheckout(orderId: string) {
  fetch("/api/checkout/attribute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  }).catch(() => {});
}

const METHODS = [
  { id: "stripe_card", label: "Card via Stripe Test Mode", icon: CreditCard },
  { id: "ewallet", label: "Touch 'n Go / GrabPay", icon: Smartphone },
  { id: "bank_transfer", label: "Bank transfer (demo)", icon: CreditCard },
  { id: "wallet", label: "MyWisata Wallet Balance", icon: Wallet },
  { id: "wallet_split", label: "Wallet first + card remainder", icon: Wallet },
];

type WalletSummary = {
  topupSen: number;
  earningsSen: number;
};

export default function CheckoutPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { selectedItems, selectedKeys, totals } = useCart();
  const [voucherCode, setVoucherCode] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<Voucher | undefined>(undefined);
  const [method, setMethod] = useState("stripe_card");
  const [paying, setPaying] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [walletSummaryLoaded, setWalletSummaryLoaded] = useState(false);

  useEffect(() => {
    setVoucherCode(new URLSearchParams(window.location.search).get("voucher"));
  }, []);

  useEffect(() => {
    if (voucherCode) getVoucherByCode(voucherCode).then(setVoucher);
  }, [voucherCode]);

  useEffect(() => {
    if (!currentUser) return;
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
  }, [currentUser]);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("stripe_session_id");
    if (!sessionId || !currentUser || selectedItems.length === 0 || paying) return;
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
  }, [currentUser, selectedItems.length, selectedKeys, paying, router, voucherCode]);

  const { subtotal, discount, total } = totals(voucher);
  const totalSen = Math.round(total * 100);
  const walletSpendableSen = (walletSummary?.topupSen ?? 0) + (walletSummary?.earningsSen ?? 0);
  const walletInsufficient = walletSummaryLoaded && walletSpendableSen < totalSen;

  if (selectedItems.length === 0) {
    return <EmptyState title="Nothing to check out" description="Select at least one item in your cart to continue." action={<Link href="/customer/cart" className="font-semibold text-primary hover:underline">Back to cart</Link>} />;
  }

  async function handlePay(shouldSucceed: boolean) {
    if (paying) return; // double-submit guard
    setPaying(true);
    setCheckoutError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      const prepareResponse = await fetch("/api/checkout/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ selectedKeys: [...selectedKeys], voucherCode, paymentMethod: method, idempotencyKey }),
      });
      const prepared = await prepareResponse.json() as { data?: { checkout_session_id?: string; order_id?: string; stripeUrl?: string }; error?: CheckoutErrorPayload };
      if (!prepareResponse.ok || !prepared.data?.checkout_session_id) {
        throw new Error(getCheckoutErrorMessage(prepared.error));
      }
      if ((method === "stripe_card" || method === "wallet_split") && prepared.data.stripeUrl) {
        if (!prepared.data.stripeUrl) throw new Error("stripe_url_missing");
        window.location.href = prepared.data.stripeUrl;
        return;
      }
      const finalizeResponse = await fetch("/api/checkout/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId: prepared.data.checkout_session_id, outcome: shouldSucceed ? "succeeded" : "failed" }),
      });
      const finalized = await finalizeResponse.json() as { data?: { order_id?: string }; error?: CheckoutErrorPayload };
      if (!finalizeResponse.ok || !finalized.data?.order_id) throw new Error(getCheckoutErrorMessage(finalized.error));
      if (!shouldSucceed) throw new Error("payment_failed");
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
      <Link href="/customer/cart" className="mb-5 inline-flex items-center text-sm font-semibold text-primary hover:underline">← Back to cart</Link>
      <h1 className="text-2xl font-bold text-foreground mb-2 font-[family-name:var(--font-display)]">Checkout</h1>
      <nav aria-label="Checkout progress" className="mb-5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Link href="/customer/cart" className="text-primary hover:underline">Cart</Link>
        <span aria-hidden="true">→</span>
        <span className="text-foreground" aria-current="step">Checkout</span>
        <span aria-hidden="true">→</span>
        <span>Confirmation</span>
      </nav>
      <p className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5">
        <ShieldCheck size={13} /> Stripe uses the existing test-mode integration. Other methods remain demo flows until their provider is connected.
      </p>

      <div className="rounded-xl border border-border p-4 mb-6 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-semibold text-foreground font-[family-name:var(--font-mono)]">RM {subtotal.toFixed(2)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Discount ({voucherCode})</span>
            <span className="font-semibold text-primary font-[family-name:var(--font-mono)]">− RM {discount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-base pt-2 border-t border-border">
          <span className="font-bold text-foreground">Total</span>
          <span className="font-bold text-primary font-[family-name:var(--font-mono)]">RM {total.toFixed(2)}</span>
        </div>
      </div>

      <p className="text-xs font-semibold text-muted-foreground mb-2">Payment method</p>
      <div className="space-y-2 mb-6">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={m.id === "wallet" && walletInsufficient}
            onClick={() => setMethod(m.id)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border text-left disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: method === m.id ? "var(--primary)" : "var(--border)", backgroundColor: method === m.id ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}
          >
            <m.icon size={16} className="text-teal shrink-0" />
            <span className="text-sm font-medium text-foreground flex-1">{m.label}</span>
            {m.id === "wallet" && walletSummaryLoaded && (
              <span className="text-xs text-muted-foreground font-[family-name:var(--font-mono)]">
                RM {(walletSpendableSen / 100).toFixed(2)}
              </span>
            )}
          </button>
        ))}
      </div>

      {walletInsufficient && (
        <p className="-mt-3 mb-6 text-xs text-muted-foreground">
          Wallet payment is unavailable for this order because your spendable balance is too low. Pending rewards and withdrawal reserves cannot be used for checkout.
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
            Return to cart
          </button>
          {checkoutError.includes("Wallet balance is no longer sufficient") && (
            <div className="mt-3 flex gap-2 pl-6">
              <Button type="button" size="sm" onClick={() => router.push("/customer/wallet?topup=1")}>Top Up</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setMethod("stripe_card"); setCheckoutError(null); }}>Pay by card</Button>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button className="flex-1 h-12 rounded-full" disabled={paying} onClick={() => handlePay(true)}>
          {paying ? "Processing…" : "Pay (Success)"}
        </Button>
        <Button variant="outline" className="flex-1 h-12 rounded-full" disabled={paying || method === "stripe_card" || method === "wallet_split"} onClick={() => handlePay(false)}>
          Simulate failure
        </Button>
      </div>
    </div>
  );
}
