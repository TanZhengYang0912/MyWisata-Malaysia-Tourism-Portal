export function getOutletShopHref(outletId: string): string {
  return `/customer/outlets/${encodeURIComponent(outletId)}`;
}
