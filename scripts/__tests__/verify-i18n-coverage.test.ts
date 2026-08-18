import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/verify-i18n-coverage.mjs");
const temporaryRoots: string[] = [];

function writeJson(root: string, relativePath: string, value: unknown): void {
  const filePath = join(root, relativePath);
  mkdirSync(resolve(filePath, ".."), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(root: string, relativePath: string, value: string): void {
  const filePath = join(root, relativePath);
  mkdirSync(resolve(filePath, ".."), { recursive: true });
  writeFileSync(filePath, value);
}

function createMiniRepository(): string {
  const root = mkdtempSync(join(tmpdir(), "verify-i18n-coverage-"));
  temporaryRoots.push(root);

  for (const locale of ["en", "zh-CN", "ms"]) {
    writeJson(root, `app/i18n/locales/${locale}/common.json`, {
      ui: {
        greeting: locale === "en" ? "Hello" : locale === "zh-CN" ? "你好" : "Hai",
        tagline: locale === "en" ? "Explore Malaysia" : locale === "zh-CN" ? "探索马来西亚" : "Terokai Malaysia",
      },
    });
  }

  writeText(root, "app/customer/page.tsx", "export default function CustomerPage() { return null; }\n");
  writeText(
    root,
    "app/customer/__tests__/sitewide-i18n.contract.test.ts",
    `export const CUSTOMER_I18N_FILES = [\n  "app/customer/page.tsx",\n] as const;\n`,
  );

  return root;
}

async function verify(root: string): Promise<{ ok: boolean; errors: string[] }> {
  const verifierModule = await import("../verify-i18n-coverage.mjs");
  return verifierModule.verifyI18nCoverage(root);
}

function runCli(root: string) {
  return spawnSync(process.execPath, [scriptPath, root], { encoding: "utf8" });
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("verifyI18nCoverage", () => {
  it("fails for a missing Malay key, then succeeds after the key is added", async () => {
    const root = createMiniRepository();
    const malayPath = join(root, "app/i18n/locales/ms/common.json");
    const malay = JSON.parse(readFileSync(malayPath, "utf8")) as { ui: Record<string, string> };
    delete malay.ui.tagline;
    writeJson(root, "app/i18n/locales/ms/common.json", malay);

    const failed = await verify(root);
    expect(failed.ok).toBe(false);
    expect(failed.errors.join("\n")).toContain("app/i18n/locales/ms/common.json");
    expect(failed.errors.join("\n")).toContain("locale=ms");
    expect(failed.errors.join("\n")).toContain("namespace=common");
    expect(failed.errors.join("\n")).toContain("key=ui.tagline");

    const failedCli = runCli(root);
    expect(failedCli.status).not.toBe(0);

    writeJson(root, "app/i18n/locales/ms/common.json", {
      ui: { greeting: "Hai", tagline: "Terokai Malaysia" },
    });

    const passed = await verify(root);
    expect(passed).toEqual({ ok: true, errors: [] });
    expect(runCli(root).status).toBe(0);
  });

  it("reports malformed locale JSON with its path, locale, and namespace", async () => {
    const root = createMiniRepository();
    writeText(root, "app/i18n/locales/ms/common.json", '{"ui":');

    const result = await verify(root);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("app/i18n/locales/ms/common.json");
    expect(result.errors.join("\n")).toContain("locale=ms");
    expect(result.errors.join("\n")).toContain("namespace=common");
    expect(result.errors.join("\n")).toContain("malformed JSON");
  });

  it("reports empty translation values with the exact key", async () => {
    const root = createMiniRepository();
    writeJson(root, "app/i18n/locales/ms/common.json", {
      ui: { greeting: "Hai", tagline: "  " },
    });

    const result = await verify(root);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("locale=ms");
    expect(result.errors.join("\n")).toContain("namespace=common");
    expect(result.errors.join("\n")).toContain("key=ui.tagline");
    expect(result.errors.join("\n")).toContain("empty translation value");
  });

  it("reports a tracked UI inventory file that is missing", async () => {
    const root = createMiniRepository();
    unlinkSync(join(root, "app/customer/page.tsx"));

    const result = await verify(root);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("app/customer/page.tsx");
    expect(result.errors.join("\n")).toContain("tracked UI inventory file is missing");
  });

  it("defaults the CLI root to the current working directory", () => {
    expect(existsSync(scriptPath)).toBe(true);
    const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
    expect(result.status).toBe(0);
  });
});
