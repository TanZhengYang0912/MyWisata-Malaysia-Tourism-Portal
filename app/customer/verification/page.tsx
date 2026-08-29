"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { BusinessShareBanner } from "@/components/profile/business-share-banner";
import { useAuth } from "@/components/providers/auth";
import type { CapabilityKey } from "@/lib/entitlements/types";

const INTENTS = [
  { capability: "commerce.checkout", key: "checkout", paths: [{ href: "/customer/phone", key: "phone" }] },
  { capability: "recommendation.submit", key: "recommendation", paths: [{ href: "/customer/profile", key: "profile" }, { href: "/customer/kyc", key: "kyc" }] },
  { capability: "affiliate.full", key: "affiliate", paths: [{ href: "/customer/profile", key: "profileLimited" }, { href: "/customer/kyc", key: "kycFull" }] },
  { capability: "wallet.request_withdrawal", key: "withdrawal", paths: [{ href: "/customer/kyc", key: "kyc" }] },
] as const satisfies ReadonlyArray<{
  capability: CapabilityKey;
  key: string;
  paths: ReadonlyArray<{ href: string; key: string }>;
}>;

export default function AccountVerificationPage() {
  const { t: tCustomer } = useTranslation("customer");
  const { currentUser, loading, capabilities, verificationFacts } = useAuth();

  if (loading) {
    return <CustomerPageShell><div className="py-8 text-center text-sm text-muted-foreground">{tCustomer("ui.states.loading")}</div></CustomerPageShell>;
  }
  if (!currentUser || !verificationFacts) {
    return <CustomerPageShell><GuestAccountEmptyState title={tCustomer("ui.accountVerification.guestTitle")} description={tCustomer("ui.accountVerification.guestDescription")} nextPath="/customer/verification" /></CustomerPageShell>;
  }

  const statuses = [
    { key: "phone", href: "/customer/phone", complete: verificationFacts.phoneVerified, icon: Phone },
    { key: "profile", href: "/customer/profile", complete: verificationFacts.profileComplete, icon: UserRound },
    { key: "kyc", href: "/customer/kyc", complete: verificationFacts.kycStatus === "approved", detail: verificationFacts.kycStatus, icon: ShieldCheck },
  ] as const;

  return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.account")}
        title={tCustomer("ui.accountVerification.title")}
        description={tCustomer("ui.accountVerification.description")}
        icon={<ShieldCheck size={14} />}
      />
      <CustomerPageShell wide className="pt-0 sm:pt-0">
        <BusinessShareBanner />

        <section aria-labelledby="verification-status-title" className="mb-8">
          <h2 id="verification-status-title" className="text-lg font-bold text-foreground">{tCustomer("ui.accountVerification.statuses.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tCustomer("ui.accountVerification.statuses.description")}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {statuses.map((status) => {
              const Icon = status.icon;
              const state = status.key === "kyc" && status.detail !== "unverified" && !status.complete
                ? status.detail
                : status.complete ? "complete" : "available";
              return (
                <Link key={status.key} href={status.href} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/30 hover:bg-primary/[0.03]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><Icon size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-foreground">{tCustomer(`ui.accountVerification.statuses.${status.key}.title`)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{tCustomer(`ui.accountVerification.statuses.states.${state}`)}</span>
                  </span>
                  {status.complete ? <CheckCircle2 size={18} className="shrink-0 text-primary" /> : <Circle size={18} className="shrink-0 text-muted-foreground" />}
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="verification-intents-title">
          <h2 id="verification-intents-title" className="text-lg font-bold text-foreground">{tCustomer("ui.accountVerification.intents.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{tCustomer("ui.accountVerification.intents.description")}</p>
          <div className="mt-4 space-y-3">
            {INTENTS.map((intent) => {
              const allowed = capabilities[intent.capability]?.allowed === true;
              return (
                <article key={intent.capability} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-foreground">{tCustomer(`ui.accountVerification.intents.${intent.key}.title`)}</h3>
                        {allowed && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{tCustomer("ui.accountVerification.available")}</span>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{tCustomer(`ui.accountVerification.intents.${intent.key}.description`)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {intent.paths.map((path) => (
                        <Link key={`${intent.capability}-${path.href}-${path.key}`} href={path.href} className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/[0.06]">
                          {tCustomer(`ui.accountVerification.paths.${path.key}`)}
                          <ArrowRight size={14} />
                        </Link>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </CustomerPageShell>
    </>
  );
}
