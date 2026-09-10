import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const entryPoints = [
  "app/login/page.tsx",
  "app/customer/layout.tsx",
  "app/guest/layout.tsx",
  "components/layout/vendor-header.tsx",
  "app/admin/layout.tsx",
];

function renderedLanguageSwitcher(sourceText: string) {
  return sourceText.match(/<LanguageSwitcher\b[^>]*\/>/g) ?? [];
}

describe("shared language entry points", () => {
  it("renders the shared component JSX from every required entry point", () => {
    for (const path of entryPoints) {
      const contents = source(path);
      expect(renderedLanguageSwitcher(contents), path).toHaveLength(1);
    }
  });

  it("keeps each placement relationship in rendered JSX", () => {
    const login = source("app/login/page.tsx");
    expect(login).toMatch(/<LanguageSwitcher compact \/>[\s\S]*?<Card/);

    const customer = source("app/customer/layout.tsx");
    expect(customer).toMatch(/<LanguageSwitcher compact className="hidden md:flex w-28" \/>[\s\S]*?<AppearanceControl \/>/);
    expect(customer).not.toMatch(/<div className="mt-2 border-t border-border pt-2">\s*<LanguageSwitcher compact/);

    const guest = source("app/guest/layout.tsx");
    expect(guest).toMatch(/<header[\s\S]*?<LanguageSwitcher compact[^>]*\/>[\s\S]*?guest\.mode[\s\S]*?account\.signIn[\s\S]*?<\/header>/);
    expect(guest).not.toContain("fixed right-4 top-4");

    const vendor = source("components/layout/vendor-header.tsx");
    expect(vendor).toMatch(/<header[\s\S]*?<LanguageSwitcher compact className="hidden w-28 sm:flex" \/>[\s\S]*?<AppearanceControl \/>[\s\S]*?actions\.signOut[\s\S]*?<\/header>/);

    const admin = source("app/admin/layout.tsx");
    expect(admin).toMatch(/<header className="sticky top-0 z-40[\s\S]*?<LanguageSwitcher compact className="w-28" \/>[\s\S]*?<AppearanceControl \/>[\s\S]*?actions\.signOut/);
    expect(admin).not.toContain('AppearanceControl variant="sidebar-dark"');
  });

  it("removes the duplicate profile language section after moving it to customer navigation", () => {
    const contents = source("components/profile/profile-sections.tsx");
    const languageSections = contents.match(/<SectionCard id="language-region"[\s\S]*?<\/SectionCard>/g) ?? [];
    expect(languageSections).toHaveLength(0);
    expect(contents).not.toContain("LanguageSwitcher");
    expect(contents).not.toContain("language.andRegion");
  });

  it("uses one shared native-label source instead of shell-owned option lists", () => {
    for (const path of entryPoints) {
      const contents = source(path);
      expect(contents, path).not.toMatch(/English|简体中文|Bahasa Melayu/);
      expect(contents, path).not.toMatch(/APP_LOCALES|LANGUAGE_OPTIONS/);
    }
  });

  it("renders customer navigation and account copy from declared translation keys", () => {
    const customer = source("app/customer/layout.tsx");
    expect(customer).not.toContain("function customerNavigationKey");
    expect(customer).toContain("tCustomer(item.labelKey)");
    expect(customer).toContain("tCustomer(group.labelKey)");
    expect(customer).toContain('tCustomer(`${item.labelKey}.label`)');
    expect(customer).toContain('tCustomer(`${item.labelKey}.description`)');
    expect(customer).toContain('tCustomer("accountItems.vouchers.label")');
    expect(customer).toContain('aria-label={tCustomer("accountItems.vouchers.label")}');
    expect(customer).not.toContain('aria-label="My Vouchers"');
  });

  it("translates guest and admin accessibility copy through resources", () => {
    const guest = source("app/guest/layout.tsx");
    expect(guest).not.toContain("Guest Mode");
    expect(guest).not.toMatch(/>Sign in</);
    expect(guest).toContain('tCommon("guest.mode")');
    expect(guest).toContain('tCommon("account.signIn")');

    const admin = source("app/admin/layout.tsx");
    expect(admin).toContain('countLabel: count > 0 ? tAdmin("accessibility.pendingItems", { count }) : undefined');
    expect(source("components/layout/portal-sidebar.tsx")).toContain('aria-label={item.countLabel ?? String(item.count)}');
    expect(admin).not.toContain("pending items`}");
  });

  it("translates fixed login entry-point copy through auth and common resources", () => {
    const login = source("app/login/page.tsx");
    expect(login).not.toMatch(/>Sign in</);
    expect(login).not.toContain("Guest Mode");
    expect(login).not.toContain("Unable to sign in. Check your email and password.");
    expect(login).not.toContain("Unable to start Guest Mode. Please try again.");
    expect(login).toContain('tCommon("account.signIn")');
    expect(login).toContain('tCommon("guest.mode")');
    expect(login).toContain('tAuth("signIn.error")');
    expect(login).toContain('tCommon("guest.startError")');
  });
});
