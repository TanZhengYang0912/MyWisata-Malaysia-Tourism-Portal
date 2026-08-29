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

const CustomerCapabilityGateContext = createContext<CustomerCapabilityGateContextValue | null>(null);

export function capabilityGateCopyKey(blockerCode: CustomerCapabilityBlocker): string {
  if (blockerCode === "PROFILE_OR_KYC_REQUIRED" || blockerCode === "PROFILE_REQUIRED") {
    return "ui.capabilityGate.blockers.PROFILE_COMPLETION_REQUIRED";
  }
  return `ui.capabilityGate.blockers.${blockerCode}`;
}

export function customerCapabilityRecoveryHref(
  request: CustomerCapabilityGateRequest,
): string | null {
  return customerCapabilityRecoveryHrefs(request)[0] ?? null;
}

export function customerCapabilityRecoveryHrefs(
  request: CustomerCapabilityGateRequest,
): string[] {
  const safeNext = postLoginPath(request.nextPath) ?? "/customer";
  const qualificationPaths = request.decision.qualificationPaths ?? [];
  if (qualificationPaths.length > 0) {
    return qualificationPaths.flatMap((path) => {
      const safePath = postLoginPath(path.href);
      if (!safePath) return [];
      const query = `capability=${encodeURIComponent(request.capability)}&next=${encodeURIComponent(safeNext)}`;
      return [`${safePath}?${query}`];
    });
  }

  const { nextAction } = request.decision;
  if (nextAction === "none") return [];
  if (nextAction === "sign_in" || nextAction === "verify_email") {
    return [guestLoginHref(safeNext)];
  }

  const query = `capability=${encodeURIComponent(request.capability)}&next=${encodeURIComponent(safeNext)}`;
  if (
    nextAction === "submit_kyc"
    || nextAction === "wait_for_kyc"
    || nextAction === "resubmit_kyc"
  ) {
    return [`/customer/kyc?${query}`];
  }
  return [`/customer/profile?${query}`];
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
  const recoveryHrefs = request ? customerCapabilityRecoveryHrefs(request) : [];

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
            <DialogDescription>{copyKey ? t(`${copyKey}.description`) : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRequest(null)}>
              {t("ui.capabilityGate.notNow")}
            </Button>
            {recoveryHrefs.map((recoveryHref) => (
              <Button
                key={recoveryHref}
                type="button"
                onClick={() => {
                  setRequest(null);
                  router.push(recoveryHref);
                }}
              >
                {t(`${copyKey}.cta`)}
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
