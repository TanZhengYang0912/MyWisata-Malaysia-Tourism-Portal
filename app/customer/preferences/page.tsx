"use client";

import { SlidersHorizontal } from "lucide-react";
import { PreferencesEditor } from "@/components/profile/preferences-editor";
import { CustomerPageHeader, CustomerPageShell, CustomerPanel } from "@/components/customer/customer-page-shell";

export default function PreferencesPage() {
  return (
    <CustomerPageShell>
      <CustomerPageHeader
        eyebrow="Preferences"
        title="Your travel preferences"
        description="These shape your “Recommended For You” feed. Update them anytime — the more we know, the better the suggestions."
        icon={<SlidersHorizontal size={14} />}
      />
      <CustomerPanel>
        <PreferencesEditor />
      </CustomerPanel>
    </CustomerPageShell>
  );
}
