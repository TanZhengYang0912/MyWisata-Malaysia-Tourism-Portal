"use client";

import { createContext, useContext } from "react";
import type { ReferenceCurrency } from "@/lib/currency/reference";
import type { ReferenceRateSnapshot } from "@/lib/currency/rates";

type ReferenceCurrencyContextValue = {
  currency: ReferenceCurrency;
  snapshot: ReferenceRateSnapshot | null;
};

const ReferenceCurrencyContext = createContext<ReferenceCurrencyContextValue>({
  currency: "MYR",
  snapshot: null,
});

export function ReferenceCurrencyProvider({
  children,
  currency,
  snapshot,
}: {
  children: React.ReactNode;
  currency: ReferenceCurrency;
  snapshot: ReferenceRateSnapshot | null;
}) {
  const validSnapshot = snapshot?.quote === currency ? snapshot : null;

  return (
    <ReferenceCurrencyContext.Provider value={{ currency, snapshot: validSnapshot }}>
      {children}
    </ReferenceCurrencyContext.Provider>
  );
}

export function useReferenceCurrency() {
  return useContext(ReferenceCurrencyContext);
}
