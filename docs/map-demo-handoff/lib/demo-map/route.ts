export function isDemoMapRoute(pathname: string): boolean {
  return pathname === "/demo/map" || pathname.startsWith("/demo/map/");
}
