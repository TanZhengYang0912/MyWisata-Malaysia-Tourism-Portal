import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import { capabilityLabel } from "@/components/admin/access-control/capability-label";
import { CAPABILITY_KEYS } from "@/lib/entitlements/types";
import en from "@/app/i18n/locales/en/admin.json";
import ms from "@/app/i18n/locales/ms/admin.json";
import zh from "@/app/i18n/locales/zh-CN/admin.json";

describe("Access Control capability labels", () => {
  it("has a readable name for every governed capability in all admin locales", () => {
    for (const locale of [en, ms, zh]) {
      const names = locale.accessControl.capabilityNames as Record<string, string>;
      const translate = ((key: string) => names[key.replace("accessControl.capabilityNames.", "")] ?? key) as TFunction<"admin">;
      for (const key of CAPABILITY_KEYS) {
        const nameKey = key.replaceAll(".", "_");
        expect(Object.hasOwn(names, nameKey), `Missing capability name: ${nameKey}`).toBe(true);
        expect(names[nameKey]?.trim()).toBeTruthy();
        const label = capabilityLabel(key, translate);
        expect(label).toBe(names[nameKey]);
        expect(label).toBeTruthy();
        expect(label).not.toBe(key);
        expect(label).not.toContain("accessControl.capabilityNames.");
      }
    }
  });
});
