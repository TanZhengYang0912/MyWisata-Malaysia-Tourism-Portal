"use client";

import { useTranslation } from "react-i18next";
import { SlidersHorizontal } from "lucide-react";
import { PreferencesEditor } from "@/components/profile/preferences-editor";
import { CustomerPageShell, CustomerPageTitle, CustomerPanel } from "@/components/customer/customer-page-shell";

export default function PreferencesPage() {
  const { t } = useTranslation("customer");
  return (
    <>
      <CustomerPageTitle
        eyebrow={t("ui.preferencesPage.eyebrow")}
        title={t("ui.preferencesPage.title")}
        description={t("ui.preferencesPage.description")}
        icon={<SlidersHorizontal size={14} />}
      />
      <CustomerPageShell className="pt-0 sm:pt-0">
        <CustomerPanel>
          <PreferencesEditor />
        </CustomerPanel>
      </CustomerPageShell>
    </>
  );
}
