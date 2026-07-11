"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingCart, Tag, Trash2 } from "lucide-react";
import { useCart } from "@/components/providers/cart";
import { getActivities, getOutlet, getVoucherByCode } from "@/backend/domains/catalogue";
import { unitPrice, validateVoucher } from "@/backend/core/helpers";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function CartPage() {
  const { items, updateQty, removeItem, totals } = useCart();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);

  const activities = useMemo(() => getActivities(), []);
  const voucher = appliedCode ? getVoucherByCode(appliedCode) : undefined;
  const { subtotal, discount, total } = totals(voucher);

  function applyVoucher() {
    const v = getVoucherByCode(code);
    const result = validateVoucher(v, subtotal);
    if (!result.ok) {
      setVoucherError(result.reason);
      setAppliedCode(null);
      return;
    }
    setVoucherError(null);
    setAppliedCode(code);
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingCart size={40} />}
        title="Your cart is empty"
        description="Browse experiences and add a booking or product to get started."
        action={
          <Link href="/customer/explore">
            <Button>Explore Experiences</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6 font-[family-name:var(--font-display)]">Your Cart</h1>

      <div className="space-y-3 mb-6">
        {items.map((item, i) => {
          const activity = activities.find((a) => a.id === item.activityId);
          if (!activity) return null;
          const outlet = getOutlet(activity.outletId);
          const variant = activity.variants.find((v) => v.id === item.variantId);
          const price = unitPrice(activity, item.variantId);
          return (
            <div key={`${item.activityId}-${item.variantId}-${item.slotId ?? "x"}`} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={activity.image} alt={activity.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{activity.name}</p>
                <p className="text-xs text-muted-foreground">{outlet?.name} · {variant?.label}</p>
                <p className="text-sm font-bold text-primary font-[family-name:var(--font-mono)] mt-1">RM {price}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => updateQty(i, item.qty - 1)} className="w-7 h-7 rounded-lg border border-border text-foreground">−</button>
                <span className="w-6 text-center text-sm font-semibold text-foreground">{item.qty}</span>
                <button onClick={() => updateQty(i, item.qty + 1)} className="w-7 h-7 rounded-lg border border-border text-foreground">+</button>
              </div>
              <button onClick={() => removeItem(i)} className="text-destructive shrink-0" title="Remove">
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border p-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Tag size={14} className="text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Voucher code</span>
        </div>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. WELCOME10"
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-border bg-input-background outline-none text-foreground"
          />
          <Button variant="outline" onClick={applyVoucher} disabled={!code}>Apply</Button>
        </div>
        {voucherError && <p className="text-xs text-destructive mt-2">{voucherError}</p>}
        {appliedCode && !voucherError && <p className="text-xs text-primary mt-2">Voucher {appliedCode} applied!</p>}
      </div>

      <div className="rounded-xl border border-border p-4 mb-6 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-semibold text-foreground font-[family-name:var(--font-mono)]">RM {subtotal.toFixed(2)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Discount</span>
            <span className="font-semibold text-primary font-[family-name:var(--font-mono)]">− RM {discount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-base pt-2 border-t border-border">
          <span className="font-bold text-foreground">Total</span>
          <span className="font-bold text-primary font-[family-name:var(--font-mono)]">RM {total.toFixed(2)}</span>
        </div>
      </div>

      <Button
        className="w-full h-12 rounded-full text-base"
        onClick={() => router.push(appliedCode ? `/customer/checkout?voucher=${appliedCode}` : "/customer/checkout")}
      >
        Proceed to Checkout
      </Button>
    </div>
  );
}
