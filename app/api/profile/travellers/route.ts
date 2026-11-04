import { listSavedTravellers, createSavedTraveller } from "@/lib/profile/travel-details-server";
export const dynamic = "force-dynamic";
export const GET = listSavedTravellers;
export const POST = createSavedTraveller;
