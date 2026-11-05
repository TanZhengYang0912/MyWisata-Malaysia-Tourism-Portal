import { getPersonalTravelDetails, putPersonalTravelDetails, clearPersonalTravelDetails } from "@/lib/profile/travel-details-server";
export const dynamic = "force-dynamic";
export const GET = getPersonalTravelDetails;
export const PUT = putPersonalTravelDetails;
export const DELETE = clearPersonalTravelDetails;
