import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("strict localization boundary", () => {
  it("scans all customer-facing app and component code without broad source ignores", () => {
    const config = source("i18next-cli.config.ts");

    expect(config).toContain('"app/**/*.{ts,tsx}"');
    expect(config).toContain('"components/**/*.{ts,tsx}"');
    expect(config).not.toMatch(/ignore:\s*\[[\s\S]*["'](?:lib|backend)\/\*\*/);
    expect(config).toContain('checkConcatenation: "error"');
    expect(config).toContain('acceptedTags: "all"');
  });

  it("keeps user, vendor, support, and notification content as untranslated data", () => {
    const outletRenderer = source("components/outlet/outlet-block-renderer.tsx");
    const ticketThread = source("components/shared/ticket-thread.tsx");
    const notificationCenter = source("components/shared/notification-center.tsx");
    const notificationBell = source("components/shared/notification-bell.tsx");

    expect(outletRenderer).toContain("title: block.title ||");
    expect(outletRenderer).toContain("model.body &&");
    expect(ticketThread).toContain("{item.body}");
    expect(notificationCenter).toContain("localizeNotification(item");
    expect(notificationCenter).toContain("{localized.title}");
    expect(notificationCenter).toContain("{localized.body}");
    expect(notificationBell).toContain("localizeNotification(item");
    expect(notificationBell).toContain("{localized.title}");
    expect(notificationBell).toContain("{localized.body}");
  });
});
