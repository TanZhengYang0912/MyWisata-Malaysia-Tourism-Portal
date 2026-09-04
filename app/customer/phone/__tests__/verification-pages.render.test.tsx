import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/backend/core/types";
import type { VerificationFacts } from "@/lib/entitlements/types";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  searchParams: new URLSearchParams(),
  push: vi.fn(),
}));

vi.mock("@/components/providers/auth", () => ({ useAuth: mocks.useAuth }));
// KYC's validation module shares a database barrel; rendering must never query it.
vi.mock("@/backend/supabase", () => ({ supabase: {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  useSearchParams: () => mocks.searchParams,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

import PhoneVerificationPage from "@/app/customer/phone/page";
import KycPage from "@/app/customer/kyc/page";
import { ActionFeedbackProvider } from "@/components/providers/action-feedback";

const user: User = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test customer",
  email: "customer@example.com",
  role: "customer",
  avatarInitial: "T",
  phone: "+60123456789",
  verificationTier: "kyc_verified",
};
const unverified: VerificationFacts = {
  emailVerified: true,
  phoneVerified: false,
  profileComplete: true,
  kycStatus: "unverified",
  accountStatus: "active",
  roles: ["customer"],
};

function setAccount(facts: VerificationFacts, currentUser: User = user) {
  mocks.useAuth.mockReturnValue({
    currentUser, loading: false, refreshUser: vi.fn(), verificationFacts: facts,
  });
}

function renderPage(Page: typeof PhoneVerificationPage) {
  return renderToStaticMarkup(<ActionFeedbackProvider><Page /></ActionFeedbackProvider>);
}

describe("independent verification page presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
    setAccount(unverified);
  });

  for (const [name, Page] of [["Phone", PhoneVerificationPage], ["KYC", KycPage]] as const) {
    for (const verified of [false, true]) {
      it(`${name} offers a profile return link without next when verified=${verified}`, () => {
        setAccount({ ...unverified, phoneVerified: verified, kycStatus: verified ? "approved" : "unverified" });
        const markup = renderPage(Page);
        expect(markup).toMatch(/<a\b[^>]*href="\/customer\/profile"[^>]*>[\s\S]*?ui\.profile\.backToProfile[\s\S]*?<\/a>/);
      });
    }

    it(`${name} retains safe continuation and rejects external continuation`, () => {
      setAccount({ ...unverified, phoneVerified: true, kycStatus: "approved" });
      mocks.searchParams.set("next", "/customer/wallet");
      expect(renderPage(Page)).toContain('href="/customer/wallet"');
      mocks.searchParams.set("next", "//evil.example");
      expect(renderPage(Page)).not.toContain('href="//evil.example"');
    });
  }

  it("requires OTP when phone facts are unverified despite the stored phone and legacy tier", () => {
    const markup = renderPage(PhoneVerificationPage);
    expect(markup).toContain('id="verification-phone"');
    expect(markup).toContain("ui.profileWizard.sendOtp");
    expect(markup).not.toContain("ui.phoneVerification.completeTitle");
  });

  it("does not present unverified KYC as approved despite the legacy tier", () => {
    const markup = renderPage(KycPage);
    expect(markup).toContain("ui.kyc.ready");
    expect(markup).not.toContain("ui.kyc.verified");
  });

  it("identifies the current user's verified phone instead of showing an OTP form", () => {
    setAccount({ ...unverified, phoneVerified: true });
    const markup = renderPage(PhoneVerificationPage);
    expect(markup).toContain("ui.phoneVerification.completeTitle");
    expect(markup).toContain("+60123456789");
    expect(markup).not.toContain('id="verification-phone"');
  });

  it("does not invent a phone number when the verified account has no stored number", () => {
    setAccount({ ...unverified, phoneVerified: true }, { ...user, phone: undefined });
    const markup = renderPage(PhoneVerificationPage);
    expect(markup).toContain("ui.phoneVerification.completeTitle");
    expect(markup).not.toContain("+60123456789");
    expect(markup).not.toContain("ui.profileWizard.phoneNumber");
  });
});
