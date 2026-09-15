"use client";

// P4 — "Contact vendor" on a product/activity page. Unlike OutletChatButton
// (the shop-level button), this primes the widget with a pending product
// context so the vendor sees which item the customer is asking about — the
// customer types their own first message; nothing is auto-sent.

import { MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { useSupportChat } from "@/components/providers/support-chat";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";

interface Props {
  outletId: string;
  product: { id: string; name: string; priceLabel?: string; imageUrl?: string | null };
  className?: string;
  children?: React.ReactNode;
}

export function ProductChatButton({ outletId, product, className, children }: Props) {
  const { t } = useTranslation("customer");
  const gate = useCustomerCapabilityGate();
  const { selectChat } = useSupportChat();

  async function handleChat() {
    if (!gate(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION)) return;
    const response = await fetch("/api/customer/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outletId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.data?.id) return;
    selectChat(
      { kind: "vendor", threadId: payload.data.id },
      {
        type: "product",
        productId: product.id,
        title: product.name,
        subtitle: product.priceLabel,
        imageUrl: product.imageUrl ?? null,
        href: `/customer/activity/${product.id}`,
      },
    );
  }

  return (
    <button
      type="button"
      onClick={handleChat}
      aria-label={t("ui.labels.contactViaChat")}
      className={className ?? "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-secondary"}
    >
      {children ?? (<><MessageCircle size={15} aria-hidden="true" /> {t("ui.labels.contactViaChat")}</>)}
    </button>
  );
}
