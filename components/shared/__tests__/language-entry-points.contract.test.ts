import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return execFileSync("git", ["show", `:${path}`], { encoding: "utf8" });
}

const entryPoints = [
  "app/login/page.tsx",
  "app/customer/layout.tsx",
  "app/guest/layout.tsx",
  "components/layout/vendor-sidebar.tsx",
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
    expect(customer).toMatch(/<div className="mt-2 border-t border-border pt-2">\s*<LanguageSwitcher compact className="px-1 py-1" \/>/);

    const guest = source("app/guest/layout.tsx");
    expect(guest).toMatch(/<header[\s\S]*?<LanguageSwitcher compact[^>]*\/>[\s\S]*?guest\.mode[\s\S]*?account\.signIn[\s\S]*?<\/header>/);
    expect(guest).not.toContain("fixed right-4 top-4");

    const vendor = source("components/layout/vendor-sidebar.tsx");
    expect(vendor).toMatch(/<div className="border-t border-gray-700 px-2 py-2">\s*<LanguageSwitcher compact \/>[\s\S]*?<\/div>\s*<button[\s\S]*?actions\.signOut/);

    const admin = source("app/admin/layout.tsx");
    expect(admin).toMatch(/<div className="shrink-0 border-t border-white\/10 p-3 space-y-0\.5">\s*<LanguageSwitcher compact className="mb-2" \/>[\s\S]*?actions\.signOut/);
  });

  it("renders the profile language switcher inside exactly one language section", () => {
    const contents = source("components/profile/profile-sections.tsx");
    const languageSections = contents.match(/<SectionCard id="language-region"[\s\S]*?<\/SectionCard>/g) ?? [];
    expect(languageSections).toHaveLength(1);
    expect(languageSections[0]).toContain("<LanguageSwitcher />");
    expect(contents.match(/language\.andRegion/g)).toHaveLength(1);
  });

  it("uses one shared native-label source instead of shell-owned option lists", () => {
    for (const path of entryPoints) {
      const contents = source(path);
      expect(contents, path).not.toMatch(/English|简体中文|Bahasa Melayu/);
      expect(contents, path).not.toMatch(/APP_LOCALES|LANGUAGE_OPTIONS/);
    }
  });

  it("derives customer navigation translations from stable route keys", () => {
    const customer = source("app/customer/layout.tsx");
    expect(customer).toContain("function customerNavigationKey");
    expect(customer).toContain('href.split("?")[0].replace("/customer/", "")');
    expect(customer).toContain("customerNavigationKey(item.href)");
    expect(customer).not.toContain("navigation.${item.label}");
  });

  it("translates guest and admin accessibility copy through resources", () => {
    const guest = source("app/guest/layout.tsx");
    expect(guest).not.toContain("Guest Mode");
    expect(guest).not.toMatch(/>Sign in</);
    expect(guest).toContain('tCommon("guest.mode")');
    expect(guest).toContain('tCommon("account.signIn")');

    const admin = source("app/admin/layout.tsx");
    expect(admin).toContain('aria-label={tAdmin("accessibility.unreadRecommendations", { count: unreadRecommendations })}');
    expect(admin).not.toContain("unread recommendations`}");
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
