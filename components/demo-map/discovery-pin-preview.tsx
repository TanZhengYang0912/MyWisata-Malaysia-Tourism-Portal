"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
import { Store, MapPin, X } from "lucide-react";
import type { DiscoveryPin } from "@/lib/demo-map/discovery-pins";
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";

/**
 * Renders whatever is selected on the dev discovery map — a single outlet, a
 * single place-bound activity, or every pin sharing one coordinate cluster.
 * Pure presentation: doesn't own map or selection state (spec's component
 * boundary list, docs/plans/2026-08-03-0237-dev-explore-discovery-map.md).
 */
export function DiscoveryPinPreview({ pins, onClose }: { pins: DiscoveryPin[]; onClose: () => void }) {
  const { t } = useTranslation("customer");
  if (pins.length === 0) return null;

  return (
    <aside className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="text-sm font-bold text-foreground">
          {pins.length > 1 ? `${pins.length} ${t("ui.labels.places", { ns: "customer" })}` : pins[0].kind === "outlet" ? t("ui.labels.mywisataOutlet") : t("ui.labels.placeBasedExperience")}
        </h3>
        <button type="button" onClick={onClose} aria-label={t("actions.close", { ns: "common" })} className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X size={16} />
        </button>
      </div>
      <div className="max-h-[50vh] divide-y divide-border overflow-y-auto">
        {pins.map((pin) => (pin.kind === "outlet" ? <OutletCard key={pin.id} pin={pin} /> : <ActivityCard key={pin.id} pin={pin} />))}
      </div>
    </aside>
  );
}

function OutletCard({ pin }: { pin: Extract<DiscoveryPin, { kind: "outlet" }> }) {
  const { t } = useTranslation("customer");
  return (
    <div className="p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Store size={12} /> {t("ui.labels.mywisataOutlet")}
      </div>
      <Link href={`/customer/outlet/${pin.outlet.id}`} className="mt-1 block text-sm font-bold text-foreground hover:text-primary">
        {pin.outlet.name}
      </Link>
      <p className="text-xs text-muted-foreground">{pin.outlet.vendorName ?? t("ui.labels.localVendor")}</p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin size={11} /> {pin.outlet.city}, {pin.outlet.state}
      </p>
      <ul className="mt-3 space-y-1.5">
        {pin.products.map((product) => (
          <li key={product.id}>
            <Link href={`/customer/activity/${product.id}`} className="flex items-center justify-between gap-2 text-xs text-foreground hover:text-primary">
              <span className="truncate">{product.name}</span>
              <span className="shrink-0 font-[family-name:var(--font-mono)] font-semibold">{MYR_CODE} {product.price}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActivityCard({ pin }: { pin: Extract<DiscoveryPin, { kind: "activity" }> }) {
  const { t } = useTranslation("customer");
  return (
    <div className="p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <MapPin size={12} /> {t("ui.labels.placeBasedExperience")}
      </div>
      <Link href={`/customer/activity/${pin.activity.id}`} className="mt-1 block text-sm font-bold text-foreground hover:text-primary">
        {pin.activity.name}
      </Link>
      <p className="text-xs text-muted-foreground">
        {pin.activity.typeSlugs?.join(", ") ?? pin.activity.category} · {pin.providerOutlet?.vendorName ?? pin.providerOutlet?.name ?? t("ui.labels.localVendor")}
      </p>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin size={11} /> {pin.activity.place?.district ? `${pin.activity.place.district}, ${pin.activity.place.state}` : pin.activity.place?.state}
      </p>
      <p className="mt-2 font-[family-name:var(--font-mono)] text-sm font-bold text-primary">{MYR_CODE} {pin.activity.price}</p>
    </div>
  );
}
