"use client";

import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { SaveToggleButton } from "@/components/customer/save-toggle-button";
import { useOptionalWishlist, useWishlist } from "@/components/providers/wishlist";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";

type ProductSaveButtonProps = {
  productId: string;
  productName: string;
  className?: string;
  /** 32px, to match the compact ShareButton stacked under it. */
  compact?: boolean;
};

export function ProductSaveButton(props: ProductSaveButtonProps) {
  const wishlist = useOptionalWishlist();
  // Vendor previews reuse product markup without mounting customer action providers.
  if (!wishlist) return null;
  return <CustomerProductSaveButton {...props} />;
}

function CustomerProductSaveButton({ productId, productName, className, compact }: ProductSaveButtonProps) {
  const { t } = useTranslation("customer");
  const { savedIds, toggleSaved } = useWishlist();
  const gate = useCustomerCapabilityGate();
  const [saving, setSaving] = useState(false);
  const saved = savedIds.has(productId);

  async function handleSave(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (saving || !gate(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION)) return;

    setSaving(true);
    try {
      await toggleSaved(productId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SaveToggleButton
      appearance="icon"
      saved={saved}
      disabled={saving}
      aria-label={t(saved ? "ui.activity.removeSaved" : "ui.activity.save", { name: productName })}
      title={t(saved ? "ui.activity.removeSavedShort" : "ui.activity.saveShort")}
      onClick={handleSave}
      className={`${compact ? "h-8 w-8" : "h-10 w-10"} ${className ?? ""}`}
    />
  );
}
