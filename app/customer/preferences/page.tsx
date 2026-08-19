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
        eyebrow={t("ui.preferencesPage.eyebrow", { defaultValue: "Preferences" })}
        title={t("ui.preferencesPage.title", { defaultValue: "Your travel preferences" })}
        description={t("ui.preferencesPage.description", { defaultValue: "These shape your “Recommended For You” feed. Update them anytime — the more we know, the better the suggestions." })}
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
