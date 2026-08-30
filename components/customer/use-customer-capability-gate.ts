"use client";

import { useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import { useCustomerCapabilityGateDialog } from "@/components/customer/customer-capability-gate-dialog";
import {
  type CustomerCapability,
} from "@/lib/auth/customer-capabilities";
import { parseCustomerCapabilityError } from "@/lib/auth/customer-capability-error";

export type CustomerCapabilityGate = {
  (capability: CustomerCapability, nextPath?: string): boolean;
  handleResponse: (response: Response, nextPath?: string) => Promise<boolean>;
};

export function useCustomerCapabilityGate(): CustomerCapabilityGate {
  const { capabilities, refreshUser } = useAuth();
  const { showCapabilityGate } = useCustomerCapabilityGateDialog();
  const pathname = usePathname();

  const currentPath = useCallback(() => (
    `${pathname}${typeof window === "undefined" ? "" : window.location.search}`
  ), [pathname]);

  const gate = useCallback((capability: CustomerCapability, nextPath?: string) => {
    const decision = capabilities[capability];
    if (decision.allowed) return true;

    showCapabilityGate({ capability, decision, nextPath: nextPath ?? currentPath() });
    return false;
  }, [capabilities, currentPath, showCapabilityGate]);

  const handleResponse = useCallback(async (response: Response, nextPath?: string) => {
    if (response.ok) return false;
    let payload: unknown;
    try {
      payload = await response.clone().json();
    } catch {
      return false;
    }
    const parsed = parseCustomerCapabilityError(payload);
    if (!parsed) return false;

    await refreshUser().catch(() => undefined);
    showCapabilityGate({
      ...parsed,
      nextPath: nextPath ?? currentPath(),
    });
    return true;
  }, [currentPath, refreshUser, showCapabilityGate]);

  return useMemo(
    () => Object.assign(gate, { handleResponse }),
    [gate, handleResponse],
  );
}
