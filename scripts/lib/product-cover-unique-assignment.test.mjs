import test from "node:test";
import assert from "node:assert/strict";
import { assignUniqueProductMedia, candidateScore } from "./product-cover-unique-assignment.mjs";

test("assigns different hashes and prefers product-specific files", () => {
  const products = [
    { slug: "baba-house-work-from-heritage-day-pass", name: "Work From Heritage Day Pass", product_type: "activity" },
    { slug: "baba-house-nyonya-laksa-set", name: "Nyonya Laksa Set", product_type: "food" },
  ];
  const candidates = [
    { filename: "baba-house-work-from-heritage-day-pass-real.jpg", baseSlug: "baba-house-work-from-heritage-day-pass", sha256: "a" },
    { filename: "baba-house-nyonya-laksa-set-real.jpg", baseSlug: "baba-house-nyonya-laksa-set", sha256: "b" },
    { filename: "generic-food.jpg", baseSlug: "generic-food", sha256: "c" },
  ];
  const assignments = assignUniqueProductMedia(products, candidates);
  assert.deepEqual(assignments.map(({ candidate }) => candidate.sha256), ["a", "b"]);
  assert.equal(new Set(assignments.map(({ candidate }) => candidate.sha256)).size, products.length);
});

test("scores vendor and product tokens above an unrelated candidate", () => {
  const product = { slug: "chendul-penang-chendul", name: "Original Chendul", product_type: "food" };
  assert.ok(candidateScore(product, { filename: "chendul-penang-chendul-real.jpg", baseSlug: "chendul-penang-chendul" }) > candidateScore(product, { filename: "hotel-room.jpg", baseSlug: "hotel-room" }));
});
