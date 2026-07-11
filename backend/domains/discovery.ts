// Owner: Member 3 (Discovery/Recommendation/Growth)
import { getCollection, KEYS, setCollection } from "../core/mockdb";
import type { VendorRecommendation } from "@/backend/core/types";

export function getVendorRecommendations(): VendorRecommendation[] {
  return getCollection<VendorRecommendation>(KEYS.vendorRecommendations);
}

export function reviewRecommendation(id: string, status: "approved" | "rejected"): void {
  const recs = getVendorRecommendations();
  setCollection(
    KEYS.vendorRecommendations,
    recs.map((r) => (r.id === id ? { ...r, status } : r)),
  );
}
