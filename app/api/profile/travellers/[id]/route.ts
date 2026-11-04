import { getSavedTraveller, putSavedTraveller, deleteSavedTraveller } from "@/lib/profile/travel-details-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return getSavedTraveller((await context.params).id);
}
export async function PUT(request: Request, context: Context) {
  return putSavedTraveller(request, (await context.params).id);
}
export async function DELETE(_request: Request, context: Context) {
  return deleteSavedTraveller((await context.params).id);
}
