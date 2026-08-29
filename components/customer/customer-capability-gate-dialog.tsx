"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { guestLoginHref, postLoginPath } from "@/lib/auth/guest-mode";
import type {
  CustomerCapability,
  CustomerCapabilityBlocker,
  CustomerCapabilityDecision,
} from "@/lib/auth/customer-capabilities";

export type CustomerCapabilityGateRequest = {
  capability: CustomerCapability;
  decision: CustomerCapabilityDecision;
  nextPath: string;
};

type CustomerCapabilityGateContextValue = {
  showCapabilityGate: (request: CustomerCapabilityGateRequest) => void;
};

export type CustomerCapabilityRecoveryAction = {
  href: string;
  copyKey: string;
};

const CustomerCapabilityGateContext = createContext<CustomerCapabilityGateContextValue | null>(null);

export function capabilityGateCopyKey(blockerCode: CustomerCapabilityBlocker): string {
  if (blockerCode === "PROFILE_OR_KYC_REQUIRED" || blockerCode === "PROFILE_REQUIRED") {
    return "ui.capabilityGate.blockers.PROFILE_COMPLETION_REQUIRED";
  }
  return `ui.capabilityGate.blockers.${blockerCode}`;
}

export function capabilityGateDescriptionKeys(blockerCode: CustomerCapabilityBlocker): string[] {
  if (blockerCode === "PROFILE_OR_KYC_REQUIRED") {
    return [
      "ui.capabilityGate.blockers.PROFILE_COMPLETION_REQUIRED.description",
      "ui.capabilityGate.blockers.KYC_REQUIRED.description",
    ];
  }
  return [`${capabilityGateCopyKey(blockerCode)}.description`];
}

function qualificationCopyKey(type: "email" | "phone" | "profile" | "kyc"): string {
  switch (type) {
    case "email": return "ui.capabilityGate.blockers.EMAIL_VERIFICATION_REQUIRED";
    case "phone": return "ui.capabilityGate.blockers.PHONE_VERIFICATION_REQUIRED";
    case "profile": return "ui.capabilityGate.blockers.PROFILE_COMPLETION_REQUIRED";
    case "kyc": return "ui.capabilityGate.blockers.KYC_REQUIRED";
  }
}

export function customerCapabilityRecoveryHref(
  request: CustomerCapabilityGateRequest,
): string | null {
  return customerCapabilityRecoveryHrefs(request)[0] ?? null;
}

export function customerCapabilityRecoveryHrefs(
  request: CustomerCapabilityGateRequest,
): string[] {
  return customerCapabilityRecoveryActions(request).map((action) => action.href);
}

export function customerCapabilityRecoveryActions(
  request: CustomerCapabilityGateRequest,
): CustomerCapabilityRecoveryAction[] {
  const safeNext = postLoginPath(request.nextPath) ?? "/customer";
  const qualificationPaths = request.decision.qualificationPaths ?? [];
  if (qualificationPaths.length > 0) {
    return qualificationPaths.flatMap((path) => {
      const safePath = postLoginPath(path.href);
      if (!safePath) return [];
      const query = `capability=${encodeURIComponent(request.capability)}&next=${encodeURIComponent(safeNext)}`;
      return [{ href: `${safePath}?${query}`, copyKey: qualificationCopyKey(path.type) }];
    });
  }

  const { nextAction } = request.decision;
  if (nextAction === "none") return [];
  if (nextAction === "sign_in" || nextAction === "verify_email") {
    return [{ href: guestLoginHref(safeNext), copyKey: capabilityGateCopyKey(request.decision.blockerCode!) }];
  }

  const query = `capability=${encodeURIComponent(request.capability)}&next=${encodeURIComponent(safeNext)}`;
  if (
    nextAction === "submit_kyc"
    || nextAction === "wait_for_kyc"
    || nextAction === "resubmit_kyc"
  ) {
    return [{ href: `/customer/kyc?${query}`, copyKey: capabilityGateCopyKey(request.decision.blockerCode!) }];
  }
  return [{ href: `/customer/profile?${query}`, copyKey: capabilityGateCopyKey(request.decision.blockerCode!) }];
}

export function CustomerCapabilityGateProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation("customer");
  const router = useRouter();
  const [request, setRequest] = useState<CustomerCapabilityGateRequest | null>(null);
  const showCapabilityGate = useCallback((nextRequest: CustomerCapabilityGateRequest) => {
    setRequest(nextRequest);
  }, []);
  const value = useMemo(() => ({ showCapabilityGate }), [showCapabilityGate]);

  const blockerCode = request?.decision.blockerCode;
  const copyKey = blockerCode ? capabilityGateCopyKey(blockerCode) : null;
  const descriptionKeys = blockerCode ? capabilityGateDescriptionKeys(blockerCode) : [];
  const recoveryActions = request ? customerCapabilityRecoveryActions(request) : [];

  return (
    <CustomerCapabilityGateContext.Provider value={value}>
      {children}
      <Dialog open={Boolean(request)} onOpenChange={(open) => { if (!open) setRequest(null); }}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck aria-hidden="true" />
            </div>
            <DialogTitle>{copyKey ? t(`${copyKey}.title`) : ""}</DialogTitle>
            <DialogDescription>{descriptionKeys.map((key) => t(key)).join(" ")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRequest(null)}>
              {t("ui.capabilityGate.notNow")}
            </Button>
            {recoveryActions.map((action) => (
              <Button
                key={action.href}
                type="button"
                onClick={() => {
                  setRequest(null);
                  router.push(action.href);
                }}
              >
                {t(`${action.copyKey}.cta`)}
              </Button>
            ))}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CustomerCapabilityGateContext.Provider>
  );
}

export function useCustomerCapabilityGateDialog(): CustomerCapabilityGateContextValue {
  const context = useContext(CustomerCapabilityGateContext);
  if (!context) {
    throw new Error("useCustomerCapabilityGateDialog must be used within CustomerCapabilityGateProvider");
  }
  return context;
}
