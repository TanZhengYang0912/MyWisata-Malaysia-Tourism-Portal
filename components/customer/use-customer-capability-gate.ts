"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import {
  customerAccessHref,
  resolveCustomerAccess,
  type CustomerCapability,
} from "@/lib/auth/customer-capabilities";

export function useCustomerCapabilityGate() {
  const { currentUser } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  return useCallback((capability: CustomerCapability, nextPath?: string) => {
    const decision = resolveCustomerAccess(currentUser, capability);
    if (decision === "allowed") return true;

    const currentPath = `${pathname}${typeof window === "undefined" ? "" : window.location.search}`;
    router.push(customerAccessHref(decision, nextPath ?? currentPath));
    return false;
  }, [currentUser, pathname, router]);
}
