import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { findElements, installTestDom, TestEvent } from "@/components/shared/__tests__/render-test-dom";
import { AdminMobileActions } from "../admin-mobile-actions";

vi.mock("react-i18next", () => ({
  useTranslation: (namespace: string) => ({ t: (key: string) => `${namespace}:${key}` }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogClose: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <section role="dialog">{children}</section>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/shared/language-switcher", () => ({
  LanguageSwitcher: () => <button type="button" aria-label="Language">English</button>,
}));
vi.mock("@/components/shared/appearance-control", () => ({
  AppearanceControl: () => <button type="button" aria-label="Appearance settings">Theme</button>,
}));

const componentPath = resolve(process.cwd(), "components/admin/admin-mobile-actions.tsx");
const localePaths = ["en", "ms", "zh-CN"].map((locale) =>
  resolve(process.cwd(), `app/i18n/locales/${locale}/admin.json`),
);

describe("Admin mobile actions", () => {
  it("keeps all existing account actions reachable in the labelled dialog", async () => {
    const document = installTestDom();
    const { createRoot } = await import("react-dom/client");
    const container = document.createElement("div");
    const root = createRoot(container as unknown as Element);
    const onSignOut = vi.fn();

    try {
      await act(async () => root.render(
        <AdminMobileActions
          displayName="Super Admin"
          manageDevicesHref="/auth/staff-verification"
          onSignOut={onSignOut}
        />,
      ));

      expect(findElements(container, (element) => element.getAttribute("aria-label") === "admin:shell.mobileActions.open")).toHaveLength(1);
      expect(findElements(container, (element) => element.tagName === "H2" && element.textContent === "admin:shell.mobileActions.title")).toHaveLength(1);
      expect(container.textContent).toContain("Super Admin");
      expect(container.textContent).toContain("common:language.label");
      expect(container.textContent).toContain("common:appearance.settings");
      expect(findElements(container, (element) => element.tagName === "A" && element.getAttribute("href") === "/admin/help")).toHaveLength(1);
      expect(findElements(container, (element) => element.tagName === "A" && element.getAttribute("href") === "/auth/staff-verification")).toHaveLength(1);

      const signOutButton = findElements(container, (element) => element.tagName === "BUTTON" && element.textContent === "common:actions.signOut")[0];
      expect(signOutButton).toBeDefined();
      await act(async () => signOutButton.dispatchEvent(new TestEvent("click", { bubbles: true })));
      expect(onSignOut).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("provides a mobile actions component with accessible menu controls", () => {
    expect(existsSync(componentPath)).toBe(true);
    if (!existsSync(componentPath)) return;

    const source = readFileSync(componentPath, "utf8");
    expect(source).toContain("DialogTitle");
    expect(source).toContain("LanguageSwitcher");
    expect(source).toContain("AppearanceControl");
    expect(source).toContain("/admin/help");
    expect(source).toContain("manageDevicesHref");
    expect(source).toContain("onSignOut");
  });

  it("localizes the compact menu label in English, Malay, and Simplified Chinese", () => {
    for (const localePath of localePaths) {
      const locale = JSON.parse(readFileSync(localePath, "utf8")) as {
        shell?: { mobileActions?: Record<string, unknown> };
      };
      expect(locale.shell?.mobileActions).toMatchObject({
        open: expect.any(String),
        title: expect.any(String),
        account: expect.any(String),
        security: expect.any(String),
      });
    }
  });
});
