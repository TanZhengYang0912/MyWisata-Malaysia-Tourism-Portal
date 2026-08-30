"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Phone, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { VerificationFacts } from "@/lib/entitlements/types";

type VerificationPathCardsProps = {
  phoneVerified: boolean;
  kycStatus: VerificationFacts["kycStatus"];
};

export function VerificationPathCards({ phoneVerified, kycStatus }: VerificationPathCardsProps) {
  const { t: tCustomer } = useTranslation("customer");
  const kycState = kycStatus === "approved"
    ? "complete"
    : kycStatus === "pending"
      ? "pending"
      : kycStatus === "rejected"
        ? "rejected"
        : "available";
  const paths = [
    {
      key: "phone",
      href: "/customer/phone",
      complete: phoneVerified,
      state: phoneVerified ? "complete" : "available",
      icon: Phone,
    },
    {
      key: "kyc",
      href: "/customer/kyc",
      complete: kycStatus === "approved",
      state: kycState,
      icon: ShieldCheck,
    },
  ] as const;

  return (
    <nav
      aria-label={tCustomer("ui.accountVerification.statuses.title")}
      className="mb-8 grid gap-3 sm:grid-cols-2"
    >
      {paths.map((path) => {
        const Icon = path.icon;
        return (
          <Link
            key={path.key}
            href={path.href}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/30 hover:bg-primary/[0.03]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
              <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-foreground">
                {tCustomer(`ui.accountVerification.statuses.${path.key}.title`)}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {tCustomer(`ui.accountVerification.statuses.states.${path.state}`)}
              </span>
            </span>
            {path.complete
              ? <CheckCircle2 size={18} className="shrink-0 text-primary" />
              : <Circle size={18} className="shrink-0 text-muted-foreground" />}
          </Link>
        );
      })}
    </nav>
  );
}
