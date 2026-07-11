import { getOutlets } from "@/backend/domains/catalogue";

export async function scopedOutletIds(activeVendorId?: string, activeOutletIds?: string[]): Promise<string[]> {
  if (activeOutletIds?.length) return activeOutletIds;
  if (activeVendorId) {
    const outlets = await getOutlets();
    return outlets.filter((o) => o.vendorId === activeVendorId).map((o) => o.id);
  }
  return [];
}
