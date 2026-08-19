import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "scripts/restore-chat-demo.mjs"), "utf8");

describe("restore-chat-demo", () => {
  it("requires an explicit demo-seed guard", () => {
    expect(source).toContain("CHAT_DEMO_SEED !== '1'");
    expect(source).toContain("Refusing to seed chat demo data");
  });

  it("uses current demo users and derives vendor scope from active outlets", () => {
    expect(source).toContain("customer1@demo.local");
    expect(source).toContain("customer4@demo.local");
    expect(source).toContain('from("outlets")');
    expect(source).toContain("vendor_id: outlet.vendor_id");
    expect(source).toContain('from("vendors")');
  });

  it("keeps reruns idempotent at both thread and message level", () => {
    expect(source).toContain("maybeSingle()");
    expect(source).toContain("from(\"chat_threads\").insert(threadPayload)");
    expect(source).toContain("ignoreDuplicates: true");
    expect(source).toContain("stableUuid");
  });
});
