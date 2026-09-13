import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ACTIVITY_NAME_CORRECTIONS,
  ACTIVITY_MEDIA_CORRECTIONS,
  ACTIVITY_MEDIA_SCOPE,
  validateActivityMediaRows,
} from "./activity-media-consistency.mjs";

test("activity media rules cover generic names and confirmed mismatches", () => {
  assert.equal(ACTIVITY_MEDIA_SCOPE.categories.length, 2);
  assert.equal(Object.keys(ACTIVITY_MEDIA_CORRECTIONS).length, 17);
  assert.equal(new Set(Object.values(ACTIVITY_MEDIA_CORRECTIONS)).size, 17);
  assert.equal(ACTIVITY_NAME_CORRECTIONS["upsidedown-entry-ticket"], "Upside Down House Kuching Entry");
  assert.equal(ACTIVITY_NAME_CORRECTIONS["lostworld-entry-ticket"], "Lost World of Tambun Day Pass");
  assert.equal(ACTIVITY_MEDIA_CORRECTIONS["op-river-cruise-day-ticket"], "op-river-cruise-day-ticket-corrected.jpg");
  assert.equal(ACTIVITY_MEDIA_CORRECTIONS["upsidedown-entry-ticket"], "upsidedown-entry-ticket-corrected.jpg");
  assert.equal(ACTIVITY_MEDIA_CORRECTIONS["lostworld-entry-ticket"], "lostworld-entry-ticket-corrected.jpg");

  for (const filename of Object.values(ACTIVITY_MEDIA_CORRECTIONS)) {
    assert.equal(fs.existsSync(path.join(process.cwd(), "public/assets/customer/products", filename)), true, filename);
  }
});

test("activity inventory rejects missing covers and generic titles", () => {
  const errors = validateActivityMediaRows([
    { slug: "ok", name: "Museum Entry", cover_url: "ok.jpg", category_slug: "activity" },
    { slug: "missing", name: "Entry Ticket", cover_url: null, category_slug: "activity" },
    { slug: "wrong-category", name: "Entry Ticket", cover_url: "wrong.jpg", category_slug: "food" },
  ]);

  assert.deepEqual(errors, [
    "missing: missing cover_url",
    "missing: generic activity name",
  ]);
});
