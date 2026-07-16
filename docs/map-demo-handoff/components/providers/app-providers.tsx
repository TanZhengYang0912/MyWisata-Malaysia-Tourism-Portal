"use client";

import { usePathname } from "next/navigation";
import { ActionFeedbackProvider } from "./action-feedback";
import { AuthProvider } from "./auth";
import { CartProvider } from "./cart";
import { isDemoMapRoute } from "@/lib/demo-map/route";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isDemoMapRoute(pathname)) {
    return <ActionFeedbackProvider>{children}</ActionFeedbackProvider>;
  }

  return (
    <ActionFeedbackProvider>
      <AuthProvider>
        <CartProvider>{children}</CartProvider>
      </AuthProvider>
    </ActionFeedbackProvider>
  );
}
