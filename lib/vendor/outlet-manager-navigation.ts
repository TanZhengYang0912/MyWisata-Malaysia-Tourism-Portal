export const OUTLET_MANAGER_SHOP_PAGE_HREF = '/vendor/outlets?mode=shop';
export const OUTLET_MANAGER_SHOP_EDITOR_HREF = '/vendor/outlets?mode=shop&edit=1';

export function getOutletManagerDestination(isOutletManager: boolean): string {
  return isOutletManager ? OUTLET_MANAGER_SHOP_PAGE_HREF : '/vendor/outlets';
}

export function getOutletManagerEditorDestination(isOutletManager: boolean): string {
  return isOutletManager ? OUTLET_MANAGER_SHOP_EDITOR_HREF : '/vendor/outlets';
}

export function isOutletManagerShopMode(
  isOutletManager: boolean,
  mode: string | null | undefined,
): boolean {
  return isOutletManager && (mode === 'shop' || mode === null || mode === undefined || mode === '');
}

export function isOutletManagerShopEditMode(
  isOutletManager: boolean,
  edit: string | null | undefined,
): boolean {
  return isOutletManager && edit === '1';
}
