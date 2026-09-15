"use client";

import { useEffect, useState } from "react";
import { RedemptionScanner } from "@/components/vendor/redemption-scanner";
import { useAuth } from "@/hooks/use-auth";

type Outlet = { id: string; name: string };

export default function VendorScannerPage() {
  const { user } = useAuth();
  const vendorId = user?.activeVendorId;
  const [outlets, setOutlets] = useState<Outlet[]>([]);

  useEffect(() => {
    if (!vendorId) return;
    let active = true;
    fetch(`/api/vendors/${vendorId}/outlets?view=booking_metadata&sort=name`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { data?: { items?: Outlet[] } }) => { if (active) setOutlets((payload.data?.items ?? []).map((outlet) => ({ id: outlet.id, name: outlet.name }))); })
      .catch(() => { if (active) setOutlets((user?.activeOutletIds ?? []).map((id) => ({ id, name: id }))); });
    return () => { active = false; };
  }, [user?.activeOutletIds, vendorId]);

  if (!vendorId) return null;
  return <RedemptionScanner vendorId={vendorId} outlets={outlets} />;
}
