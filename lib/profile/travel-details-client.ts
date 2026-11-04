export class TravelDetailsRequestError extends Error {
  constructor(public status: number) { super("Travel details request failed"); }
}
export async function requestTravelDetails<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  if (!response.ok) throw new TravelDetailsRequestError(response.status);
  const body = await response.json() as { data: T };
  return body.data;
}
export function travelDetailsErrorKey(error: unknown) {
  if (error instanceof TravelDetailsRequestError) {
    if (error.status === 401) return "ui.travelDetails.sessionExpired";
    if (error.status === 403) return "ui.travelDetails.accountUnavailable";
    if (error.status === 422) return "ui.travelDetails.validationError";
    if (error.status === 404) return "ui.travelDetails.notFound";
  }
  return "ui.travelDetails.requestError";
}
