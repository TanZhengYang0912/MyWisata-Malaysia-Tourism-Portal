export function filterActivitiesByVendor<T extends { outlet: { vendorId: string } }>(activities: T[], vendorId?: string | null): T[] {
  if (!vendorId) return activities;
  return activities.filter((activity) => activity.outlet.vendorId === vendorId);
}
