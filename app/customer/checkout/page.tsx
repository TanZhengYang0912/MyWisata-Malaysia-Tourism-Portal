"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CreditCard, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useCart } from "@/components/providers/cart";
import { createOrder } from "@/backend/domains/commerce";
import { getVoucherByCode } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { Voucher } from "@/backend/core/types";

const METHODS = [
  { id: "card", label: "Card", icon: CreditCard },
  { id: "ewallet", label: "Touch 'n Go / GrabPay", icon: Smartphone },
  { id: "wallet", label: "MyWisata Wallet Balance", icon: Wallet },
];

export default function CheckoutPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { items, totals } = useCart();
  const [voucherCode, setVoucherCode] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<Voucher | undefined>(undefined);
  const [method, setMethod] = useState("card");
  const [paying, setPaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setVoucherCode(new URLSearchParams(window.location.search).get("voucher"));
  }, []);

  useEffect(() => {
    if (voucherCode) getVoucherByCode(voucherCode).then(setVoucher);
  }, [voucherCode]);

  const { subtotal, discount, total } = totals(voucher);

  if (items.length === 0) {
    return <EmptyState title="Nothing to check out" description="Your cart is empty." />;
  }

  function handlePay(shouldSucceed: boolean) {
    if (paying) return; // double-submit guard
    setPaying(true);
    setFailed(false);
    setTimeout(async () => {
      if (!shouldSucceed) {
        setFailed(true);
        setPaying(false);
        return;
      }
      try {
        const order = await createOrder(currentUser!.id, voucherCode ?? undefined);
        router.push(`/customer/orders/${order.id}`);
      } catch (err) {
        console.error("Order creation failed:", err);
        setFailed(true);
        setPaying(false);
      }
    }, 600);
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-2 font-[family-name:var(--font-display)]">Checkout</h1>
      <p className="text-xs text-muted-foreground mb-6 flex items-center gap-1.5">
        <ShieldCheck size={13} /> Demo / Mock payment — no real money moves.
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

      <p className="text-xs font-semibold text-muted-foreground mb-2">Payment method (Demo)</p>
      <div className="space-y-2 mb-6">
        {METHODS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMethod(m.id)}
            className="w-full flex items-center gap-3 p-3 rounded-xl border text-left"
            style={{ borderColor: method === m.id ? "var(--primary)" : "var(--border)", backgroundColor: method === m.id ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }}
          >
            <m.icon size={16} className="text-teal shrink-0" />
            <span className="text-sm font-medium text-foreground">{m.label}</span>
          </button>
        ))}
      </div>

      {failed && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-sm mb-4">
          <AlertCircle size={15} /> Payment failed (demo). Please try again.
        </div>
      )}

      <div className="flex gap-3">
        <Button className="flex-1 h-12 rounded-full" disabled={paying} onClick={() => handlePay(true)}>
          {paying ? "Processing…" : "Pay (Success)"}
        </Button>
        <Button variant="outline" className="flex-1 h-12 rounded-full" disabled={paying} onClick={() => handlePay(false)}>
          Pay (Fail — demo)
        </Button>
      </div>
    </div>
  );
}
