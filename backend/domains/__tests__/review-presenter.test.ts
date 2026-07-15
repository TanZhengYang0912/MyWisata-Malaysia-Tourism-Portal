import { describe, expect, it } from "vitest";
import { formatReviewAuthor, toProductReview } from "@/backend/domains/review-presenter";

describe("review presenter", () => {
  it("keeps a first name and masks the surname", () => {
    expect(formatReviewAuthor("Nur Aisyah Rahman")).toBe("Nur R.");
    expect(formatReviewAuthor(null)).toBe("Verified visitor");
  });

  it("maps a visible review row into the customer display contract", () => {
    expect(toProductReview({
      id: "review-1",
      rating: 5,
      title: "Wonderful workshop",
      body: "The host was warm and helpful.",
      created_at: "2026-07-10T10:00:00.000Z",
      users: { full_name: "Sarah Lim" },
    })).toEqual({
      id: "review-1",
      rating: 5,
      title: "Wonderful workshop",
      body: "The host was warm and helpful.",
      createdAt: "2026-07-10T10:00:00.000Z",
      authorName: "Sarah L.",
      verifiedPurchase: true,
    });
  });
});
