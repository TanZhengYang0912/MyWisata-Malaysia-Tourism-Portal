"use client";

import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import { PreferencesEditor } from "@/components/profile/preferences-editor";
import { CustomerPageHeader, CustomerPageShell, CustomerPanel } from "@/components/customer/customer-page-shell";
import { useAuth } from "@/components/providers/auth";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";

export default function PreferencesPage() {
  const { t: tCustomer } = useTranslation("customer");
  const { currentUser } = useAuth();
  if (!currentUser) return <CustomerPageShell><GuestAccountEmptyState title={tCustomer("ui.states.noStats")} description={tCustomer("ui.guest.accountHint")} nextPath="/customer/preferences" /></CustomerPageShell>;
  return (
    <CustomerPageShell>
      <CustomerPageHeader
        eyebrow={tCustomer("ui.preferencesPage.eyebrow")}
        title={tCustomer("ui.preferencesPage.title")}
        description={tCustomer("ui.preferencesPage.description")}
        icon={<SlidersHorizontal size={14} />}
      />
      <CustomerPanel>
        <PreferencesEditor />
      </CustomerPanel>
    </CustomerPageShell>
  );
}
