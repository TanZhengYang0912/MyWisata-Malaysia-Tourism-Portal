import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const temporaryRoots: string[] = [];

function fixture(source: string): string {
  const root = mkdtempSync(join(tmpdir(), "verify-i18n-default-values-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "components"), { recursive: true });
  writeFileSync(join(root, "components", "example.tsx"), source);
  return root;
}

async function verify(root: string) {
  const verifier = await import("../verify-i18n-default-values.mjs");
  return verifier.verifyI18nDefaultValues(root) as { ok: boolean; errors: string[] };
}

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe("verifyI18nDefaultValues", () => {
  it("rejects English defaultValue while preserving normal interpolation options", async () => {
    const failed = await verify(fixture(`export const A = () => tCommon("greeting", { defaultValue: "Hello", name: "A" });\n`));
    expect(failed.ok).toBe(false);
    expect(failed.errors.join("\n")).toContain("components/example.tsx:1");
    expect(failed.errors.join("\n")).toContain("defaultValue is forbidden");

    const passed = await verify(fixture(`export const A = () => tCommon("greeting", { name: "A" });\n`));
    expect(passed).toEqual({ ok: true, errors: [] });
  });

  it("ignores tests and non-translation APIs", async () => {
    const root = fixture(`export const config = fn("value", { defaultValue: "technical" });\n`);
    mkdirSync(join(root, "components", "__tests__"), { recursive: true });
    writeFileSync(join(root, "components", "__tests__", "example.test.tsx"), `t("key", { defaultValue: "fixture" });\n`);

    expect(await verify(root)).toEqual({ ok: true, errors: [] });
  });
});
