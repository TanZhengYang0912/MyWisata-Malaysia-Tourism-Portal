import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repairSource = readFileSync(resolve(process.cwd(), "scripts/repair-vendor-outlet-media.mjs"), "utf8");
const restoreSource = readFileSync(resolve(process.cwd(), "scripts/restore-vendor-cover-images.mjs"), "utf8");
const verifySource = readFileSync(resolve(process.cwd(), "scripts/verify-vendor-outlet-media.mjs"), "utf8");
const verifiedSource = readFileSync(resolve(process.cwd(), "scripts/sync-verified-vendor-entity-media.mjs"), "utf8");

describe("vendor/outlet media repair boundaries", () => {
  it("never replaces persisted vendor photographs with generated entity artwork", () => {
    expect(repairSource).not.toContain("update({ logo_url: logoPath, cover_url: gallery[0].objectPath })");
    expect(repairSource).not.toContain("entity.type === \"vendor\" ? []");
  });

  it("restores only the curated vendor Storage paths and verifies full source coverage before writing", () => {
    expect(restoreSource).toContain("VENDOR_COVER_RESTORE=1");
    expect(restoreSource).toContain("vendor-images/${vendor.slug}");
    expect(restoreSource).toContain("Missing curated vendor image paths");
    expect(restoreSource).toContain("update({ cover_url: sourcePath })");
    expect(restoreSource).toContain("storage.from(BUCKET).list(prefix");
  });

  it("verifies versioned media and rejects empty Storage objects", () => {
    expect(verifySource).toContain("curated-v\\d+");
    expect(verifySource).toContain("body.length > 0");
    expect(verifySource).toContain("?verify=${Date.now()}");
    expect(verifySource).toContain('supabase.from("outlets").select("id,vendor_id")');
    expect(verifySource).toContain("approvedVendorIds");
  });

  it("adds only source-backed vendor gallery assets and never overwrites existing gallery rows", () => {
    expect(verifiedSource).toContain("VERIFIED_VENDOR_ENTITY_MEDIA=1");
    expect(verifiedSource).toContain("source_image_url.startsWith(\"https://\")");
    expect(verifiedSource).toContain("entry.artist?.trim()");
    expect(verifiedSource).toContain("entry.license?.trim()");
    expect(verifiedSource).toContain("(existing ?? []).length > 0");
    expect(verifiedSource).toContain("contentHash");
  });
});
