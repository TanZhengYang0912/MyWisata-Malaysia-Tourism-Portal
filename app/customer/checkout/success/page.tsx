"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { CustomerPageShell, CustomerPanel } from "@/components/customer/customer-page-shell";
import { Button } from "@/components/ui/button";
import { attributeCheckout } from "@/lib/checkout/attribute-checkout";

type PaymentStatus = "checking" | "confirmed" | "unconfirmed" | "missing";

type ConfirmationResponse = {
  data?: {
    order_id?: unknown;
    status?: unknown;
  };
};

export default function CheckoutSuccessPage() {
  const { t } = useTranslation("customer");
  const router = useRouter();
  const { currentUser } = useAuth();
  const [status, setStatus] = useState<PaymentStatus>("checking");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const requestInFlightRef = useRef(false);
  const attributedOrderIdRef = useRef<string | null>(null);

  const confirmPayment = useCallback(async (stripeSessionId: string) => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setStatus("checking");

    try {
      const response = await fetch("/api/checkout/confirm-stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripeSessionId }),
      });
      const body = await response.json() as ConfirmationResponse;
      const confirmedOrderId = body.data?.order_id;

      if (!response.ok || typeof confirmedOrderId !== "string") {
        throw new Error("stripe_confirmation_unavailable");
      }

      if (body.data?.status === "payment_exception") {
        router.replace(`/customer/orders/${confirmedOrderId}`);
        return;
      }

      if (body.data?.status !== "paid") {
        throw new Error("stripe_payment_not_confirmed");
      }

      setOrderId(confirmedOrderId);
      setStatus("confirmed");
    } catch {
      setStatus("unconfirmed");
    } finally {
      requestInFlightRef.current = false;
    }
  }, [router]);

  useEffect(() => {
    if (!currentUser || status !== "confirmed" || !orderId || attributedOrderIdRef.current === orderId) return;
    attributedOrderIdRef.current = orderId;
    attributeCheckout(orderId);
  }, [currentUser, orderId, status]);

  useEffect(() => {
    const stripeSessionId = new URLSearchParams(window.location.search).get("stripe_session_id");
    if (!stripeSessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("missing");
      return;
    }

    setSessionId(stripeSessionId);
    void confirmPayment(stripeSessionId);
  }, [confirmPayment]);

  const ordersHref = currentUser ? "/customer/orders" : "/customer/orders/access";
  const isConfirmed = status === "confirmed" && orderId !== null;
  const title = isConfirmed
    ? t("ui.checkout.successTitle")
    : status === "checking"
      ? t("ui.checkout.checkingPayment")
      : status === "missing"
        ? t("ui.checkout.paymentStatusUnavailable")
        : t("ui.checkout.paymentNotConfirmed");

  return (
    <CustomerPageShell className="py-16 sm:py-20">
      <CustomerPanel className="mx-auto flex max-w-xl flex-col items-center text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
          {isConfirmed ? (
            <CheckCircle2 className="size-7" />
          ) : status === "checking" ? (
            <LoaderCircle className="size-7 animate-spin motion-reduce:animate-none" />
          ) : (
            <AlertCircle className="size-7" />
          )}
        </div>
        <div role={status === "unconfirmed" || status === "missing" ? "alert" : "status"} aria-live="polite">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
          {isConfirmed && <p className="mt-2 text-sm text-muted-foreground">{t("ui.checkout.successDescription")}</p>}
        </div>
        {isConfirmed && orderId && (
          <Button asChild className="mt-6">
            <Link href={`/customer/orders/${orderId}`}>{t("ui.checkout.viewOrder")}</Link>
          </Button>
        )}
        {(status === "unconfirmed" || status === "missing") && (
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {status === "unconfirmed" && sessionId && (
              <Button type="button" onClick={() => void confirmPayment(sessionId)}>
                {t("ui.checkout.retryPaymentCheck")}
              </Button>
            )}
            <Button asChild variant={status === "missing" ? "default" : "outline"}>
              <Link href={ordersHref}>{t("ui.checkout.viewOrders")}</Link>
            </Button>
          </div>
        )}
      </CustomerPanel>
    </CustomerPageShell>
  );
}
