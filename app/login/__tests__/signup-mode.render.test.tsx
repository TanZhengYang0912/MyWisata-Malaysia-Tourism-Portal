import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => mocks.params, usePathname: () => "/login" }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ switchUser: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));
vi.mock("@/components/shared/language-switcher", () => ({ LanguageSwitcher: () => null }));

import LoginPage from "../page";

describe("login page security verification screen", () => {
  beforeEach(() => { mocks.params = new URLSearchParams(); });

  it.each(["", "mode=signup&next=%2Fcustomer%2Fcart", "mode=signin", "mode=unknown"])("keeps authentication controls behind the initial proof: %s", (query) => {
    mocks.params = new URLSearchParams(query);
    const markup = renderToStaticMarkup(<LoginPage />);
    expect(markup).toContain('data-security-verification-page="true"');
    expect(markup).toContain("humanVerification.checking");
    expect(markup).toContain("humanVerification.entryDescription");
    expect(markup).toContain('data-human-verification="login"');
    expect(markup).not.toContain("<form");
  });
});
