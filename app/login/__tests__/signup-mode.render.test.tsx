import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => mocks.params }));
vi.mock("@/components/providers/auth", () => ({ useAuth: () => ({ switchUser: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
vi.mock("@/components/shared/language-switcher", () => ({ LanguageSwitcher: () => null }));

import LoginPage from "../page";

describe("login page initial form selection", () => {
  beforeEach(() => { mocks.params = new URLSearchParams(); });

  it("opens the registration form when the guest explicitly chooses sign up", () => {
    mocks.params = new URLSearchParams("mode=signup&next=%2Fcustomer%2Fcart");
    const markup = renderToStaticMarkup(<LoginPage />);
    expect(markup).toContain('placeholder="fields.confirmPassword"');
    expect(markup).toContain("titles.createAccount");
  });

  it.each(["", "mode=signin", "mode=unknown"])("otherwise opens sign in: %s", (query) => {
    mocks.params = new URLSearchParams(query);
    const markup = renderToStaticMarkup(<LoginPage />);
    expect(markup).not.toContain('placeholder="fields.confirmPassword"');
    expect(markup).toContain("titles.welcomeBack");
  });
});
