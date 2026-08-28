"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Star, Minus, Plus } from "lucide-react";
import { useCart } from "@/components/providers/cart";
import { useTrip } from "@/components/providers/trip";
import type { BookingSlot, ComputedActivity } from "@/backend/core/types";
import { formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";

export function ExperienceBookingSidebar({
  experience,
  slots,
  outletId,
}: {
  experience: ComputedActivity;
  slots: BookingSlot[];
  outletId: string;
}) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { addItem } = useCart();
  const gate = useCustomerCapabilityGate();
  const trip = useTrip();
  const [tripAdded, setTripAdded] = useState(false);
  const [variantId, setVariantId] = useState<string>(experience.variants[0]?.id ?? "");
  const [slotId, setSlotId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const selectedVariant = experience.variants.find((v) => v.id === variantId);
  const selectedSlot = slots.find((s) => s.id === slotId);

  const basePrice = experience.price;
  const priceOffset = selectedVariant?.priceDelta ?? 0;
  const unitPrice = basePrice + priceOffset;
  const totalPrice = unitPrice * qty;

  const seatsLeft = selectedSlot ? selectedSlot.capacity - selectedSlot.booked : undefined;

  async function handleAddToCart() {
    if (adding || (experience.requiresBooking && !slotId)) return;
    if (!gate(CUSTOMER_CAPABILITY.CART_MUTATION)) return;
    setAdding(true);
    try {
      await addItem({
        activityId: experience.id,
        variantId,
        slotId: slotId || undefined,
        outletId,
        qty,
      });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  }

  return (
    <aside className="self-start lg:sticky lg:top-24">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <p className="text-3xl font-bold text-foreground">
          {MYR_CODE} {unitPrice.toFixed(2)}
          <span className="ml-1 text-sm font-medium text-muted-foreground">
            {t("ui.experience.perPerson")}
          </span>
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Star size={12} className="fill-yellow-400 text-yellow-400" />
          <span className="font-semibold text-foreground">
            {experience.rating > 0 ? experience.rating.toFixed(1) : "New"}
          </span>
          <span>·</span>
          <span>{t("ui.experience.reviewCount", { count: experience.reviews })}</span>
        </div>

        <div className="mt-6 space-y-4">
          {/* Options/Variants */}
          {experience.variants.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("ui.experience.packageOption")}
              </label>
              <div className="space-y-2">
                {experience.variants.map((v) => (
                  <label
                    key={v.id}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm transition-colors ${
                      variantId === v.id
                        ? "border-primary bg-primary/5 font-semibold text-primary"
                        : "border-border text-foreground hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="variant"
                        className="sr-only"
                        checked={variantId === v.id}
                        onChange={() => setVariantId(v.id)}
                      />
                      <div
                        className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                          variantId === v.id ? "border-primary bg-primary" : "border-border"
                        }`}
                      >
                        {variantId === v.id && <Check size={10} className="text-white" />}
                      </div>
                      {v.label}
                    </div>
                    {v.priceDelta > 0 && <span>+{MYR_CODE} {v.priceDelta.toFixed(2)}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Date & Time (Slots) */}
          {experience.requiresBooking && slots.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("ui.experience.availability")}
              </label>
              <select
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
                className="w-full appearance-none rounded-xl border border-border bg-transparent p-3 text-sm font-medium text-foreground outline-none transition hover:border-primary/30 focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="" disabled>{t("ui.experience.selectDateTime")}</option>
                {slots.map((s) => {
                  const available = s.capacity - s.booked;
                  return (
                    <option key={s.id} value={s.id} disabled={available <= 0}>
                      {formatDateTime(s.startsAt, locale, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} ({t("ui.experience.slotsLeft", { count: available })})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Traveller Count */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("ui.experience.travellers")}
            </label>
            <div className="flex items-center justify-between rounded-xl border border-border p-2">
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
                disabled={qty <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition hover:bg-primary/10 hover:text-primary disabled:opacity-50"
              >
                <Minus size={14} />
              </button>
              <span className="text-sm font-bold text-foreground">{qty}</span>
              <button
                type="button"
                onClick={() => setQty(seatsLeft ? Math.min(seatsLeft, qty + 1) : qty + 1)}
                disabled={seatsLeft !== undefined && qty >= seatsLeft}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground transition hover:bg-primary/10 hover:text-primary disabled:opacity-50"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={adding || (experience.requiresBooking && !slotId)}
            className="flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-3.5 text-sm font-bold text-white transition hover:bg-primary/90 disabled:opacity-50"
          >
            {added ? t("ui.experience.added") : adding ? t("ui.experience.adding") : t("ui.experience.bookNow")}
          </button>
          <button
            type="button"
            onClick={() => {
              trip.add({
                id: experience.id,
                lat: experience.outlet.lat ?? 0,
                lng: experience.outlet.lng ?? 0,
                label: experience.name,
                source: "vendor"
              });
              setTripAdded(true);
            }}
            disabled={tripAdded || trip.has(experience.id)}
            className="flex w-full items-center justify-center rounded-2xl border border-border px-4 py-3.5 text-sm font-bold text-foreground transition hover:border-primary/30 hover:text-primary disabled:opacity-50"
          >
            {tripAdded || trip.has(experience.id) ? t("ui.experience.addedToTrip") : t("ui.experience.addToTrip")}
          </button>
        </div>

        {qty > 0 && (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm font-bold text-foreground">
            <span>{t("ui.experience.total")}</span>
            <span>{MYR_CODE} {totalPrice.toFixed(2)}</span>
          </div>
        )}
        
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t("ui.experience.noPaymentUntilConfirmed")}
        </p>
      </div>
    </aside>
  );
}
