"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Phone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { PhoneVerificationCard } from "@/components/profile/phone-verification-card";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";
import { postLoginPath } from "@/lib/auth/guest-mode";

export default function PhoneVerificationPage() {
  const { t: tCustomer } = useTranslation("customer");
  const { currentUser, loading, refreshUser, verificationFacts } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const continuation = postLoginPath(searchParams.get("next"));

  async function handleVerified() {
    await refreshUser();
    if (continuation) router.push(continuation);
  }

  if (loading) {
    return <CustomerPageShell><div className="py-8 text-center text-sm text-muted-foreground">{tCustomer("ui.states.loading")}</div></CustomerPageShell>;
  }
  if (!currentUser) {
    return <CustomerPageShell><GuestAccountEmptyState title={tCustomer("ui.phoneVerification.guestTitle")} description={tCustomer("ui.phoneVerification.guestDescription")} nextPath={continuation ?? "/customer/phone"} /></CustomerPageShell>;
  }

  return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.account")}
        title={tCustomer("ui.phoneVerification.title")}
        description={tCustomer("ui.phoneVerification.description")}
        icon={<Phone size={14} />}
        actions={
          <Button asChild variant="outline">
            <Link href="/customer/profile">
              <ArrowLeft size={16} />
              {tCustomer("ui.profile.backToProfile")}
            </Link>
          </Button>
        }
      />
      <CustomerPageShell wide className="pt-0 sm:pt-0">
        {verificationFacts?.phoneVerified ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={20} />
              <div>
                <h2 className="font-bold text-foreground">{tCustomer("ui.phoneVerification.completeTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{tCustomer("ui.phoneVerification.completeDescription")}</p>
                {currentUser.phone && (
                  <p className="mt-2 text-sm text-foreground">
                    {tCustomer("ui.profileWizard.phoneNumber")}: <span dir="ltr">{currentUser.phone}</span>
                  </p>
                )}
              </div>
            </div>
            {continuation && <Button asChild className="mt-5"><Link href={continuation}>{tCustomer("ui.profileWizard.continue")}</Link></Button>}
          </div>
        ) : (
          <PhoneVerificationCard onVerified={handleVerified} />
        )}
      </CustomerPageShell>
    </>
  );
}
