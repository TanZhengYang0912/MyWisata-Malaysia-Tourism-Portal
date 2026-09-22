"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { RedemptionScanner } from "@/components/vendor/redemption-scanner";
import { useAuth } from "@/hooks/use-auth";

type Outlet = { id: string; name: string };

export default function VendorScannerPage() {
  const { t } = useTranslation("vendor");
  const { user, loading: authLoading } = useAuth();
  const vendorId = user?.activeVendorId;
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [outletsLoading, setOutletsLoading] = useState(true);
  const [outletsError, setOutletsError] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!vendorId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOutletsLoading(false);
      return;
    }
    let active = true;
    setOutletsLoading(true);
    setOutletsError(false);
    fetch(`/api/vendors/${vendorId}/outlets?view=booking_metadata&sort=name`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("outlet_load_failed");
        return response.json() as Promise<{ data?: { items?: Outlet[] } }>;
      })
      .then((payload) => {
        if (!active) return;
        const loadedOutlets = (payload.data?.items ?? []).map((outlet) => ({ id: outlet.id, name: outlet.name }));
        const assignedOutlets = (user?.activeOutletIds ?? []).map((id) => ({
          id,
          name: user?.activeOutletName ?? id,
        }));
        const availableOutlets = loadedOutlets.length ? loadedOutlets : assignedOutlets;
        setOutlets(availableOutlets);
        setOutletsError(availableOutlets.length === 0);
      })
      .catch(() => {
        if (!active) return;
        const assignedOutlets = (user?.activeOutletIds ?? []).map((id) => ({
          id,
          name: user?.activeOutletName ?? id,
        }));
        setOutlets(assignedOutlets);
        setOutletsError(assignedOutlets.length === 0);
      })
      .finally(() => { if (active) setOutletsLoading(false); });
    return () => { active = false; };
  }, [authLoading, user?.activeOutletIds, user?.activeOutletName, vendorId]);

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        {t("builder.loading")}
      </div>
    );
  }

  if (!vendorId) {
    return <p className="mx-auto max-w-xl px-4 py-16 text-center text-sm text-muted-foreground" role="alert">{t("ui.scanner.noVendor")}</p>;
  }

  if (outletsLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
        {t("ui.scanner.loadingOutlets")}
      </div>
    );
  }

  if (outletsError || outlets.length === 0) {
    return <p className="mx-auto max-w-xl px-4 py-16 text-center text-sm text-muted-foreground" role="alert">{t("ui.scanner.outletsUnavailable")}</p>;
  }

  return <RedemptionScanner vendorId={vendorId} outlets={outlets} />;
}
