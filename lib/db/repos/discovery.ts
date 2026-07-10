// Owner: Member 3 (Discovery/Recommendation/Growth)
import { getCollection, KEYS, setCollection } from "../index";
import type { VendorRecommendation } from "@/lib/types";

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
