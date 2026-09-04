import { describe, expect, it } from "vitest";
import { formatPlaceCommentAuthor, toPlaceComment } from "@/backend/domains/place-comments";

describe("place comment presenter", () => {
  it("formats author name preferring display name over full name", () => {
    expect(formatPlaceCommentAuthor("Nur Aisyah Rahman", "Aisyah")).toBe("Aisyah");
    expect(formatPlaceCommentAuthor("Nur Aisyah Rahman")).toBe("Nur Aisyah Rahman");
    expect(formatPlaceCommentAuthor(null, null)).toBe("Local visitor");
  });

  it("presents public user details with avatar, initials, and city", () => {
    expect(toPlaceComment({
      id: "comment-1",
      place_id: "place-1",
      user_id: "user-secret",
      body: "Bring water after noon; the shaded path is much more comfortable.",
      is_anonymous: false,
      created_at: "2026-09-04T10:00:00.000Z",
      users: {
        full_name: "Alice Tan",
        display_name: "Alice",
        avatar_url: "https://example.com/avatar.jpg",
        city: "George Town",
      },
    }, "user-secret")).toEqual({
      id: "comment-1",
      placeId: "place-1",
      body: "Bring water after noon; the shaded path is much more comfortable.",
      createdAt: "2026-09-04T10:00:00.000Z",
      authorName: "Alice",
      authorAvatarUrl: "https://example.com/avatar.jpg",
      authorInitial: "A",
      authorCity: "George Town",
      isAnonymous: false,
      canDelete: true,
    });
  });

  it("masks anonymous comments while keeping delete permissions for author", () => {
    const anonymousComment = toPlaceComment({
      id: "comment-2",
      place_id: "place-1",
      user_id: "user-secret",
      body: "Quiet place to watch the sunset.",
      is_anonymous: true,
      created_at: "2026-09-04T12:00:00.000Z",
      users: {
        full_name: "Dave Miller",
        display_name: "Dave",
        avatar_url: "https://example.com/dave.jpg",
        city: "Kuala Lumpur",
      },
    }, "user-secret");

    expect(anonymousComment).toEqual({
      id: "comment-2",
      placeId: "place-1",
      body: "Quiet place to watch the sunset.",
      createdAt: "2026-09-04T12:00:00.000Z",
      authorName: "Anonymous Visitor",
      authorAvatarUrl: null,
      authorInitial: "A",
      authorCity: null,
      isAnonymous: true,
      canDelete: true,
    });
  });
});
