import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CODE_FILES = [
  "app/login/page.tsx",
  "app/reset-password/page.tsx",
  "app/account-restore/page.tsx",
  "app/account-suspended/page.tsx",
  "app/outlet-manager-invitations/[token]/page.tsx",
  "app/vendor-invite/page.tsx",
  "components/vendor/vendor-invite-account-step.tsx",
  "components/vendor/vendor-invite-client.tsx",
  "components/vendor/vendor-invite-details-step.tsx",
  "components/vendor/vendor-invite-phone-step.tsx",
  "components/vendor/vendor-invite-wizard.tsx",
  "components/vendor/register-vendor-form.tsx",
  "app/dev/page.tsx",
  "app/dev/customize/page.tsx",
  "app/dev/customize/widgets.tsx",
  "app/dev/explore/page.tsx",
  "app/dev/explore/dev-explore-client.tsx",
  "app/dev/listings/page.tsx",
] as const;

const DIRECT_CHILDREN = [
  ["app/dev/customize/page.tsx", "./widgets"],
  ["app/dev/explore/page.tsx", "./dev-explore-client"],
] as const;

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("authentication, invitation, lifecycle, and development i18n contract", () => {
  it("enumerates every Task 6 code file and connects it to the shared translation runtime", () => {
    for (const path of CODE_FILES) {
      const contents = source(path);
      const hasRuntime = /useTranslation\(|getServerTranslation\(|useT\(/.test(contents);
      const rendersTranslatedChild =
        path === "app/vendor-invite/page.tsx" && contents.includes("<VendorInviteClient");

      expect(hasRuntime || rendersTranslatedChild, `${path} must use or render translated UI`).toBe(true);
    }
  });

  it("keeps direct rendered dev children in the translation inventory", () => {
    for (const [parent, childImport] of DIRECT_CHILDREN) {
      expect(source(parent), `${parent} must keep its direct child import`).toContain(childImport);
    }
  });

  it("renders recognized vendor registration validation keys through the shared runtime", () => {
    const registration = source("components/vendor/register-vendor-form.tsx");
    expect(registration).toContain("isVendorRegisterValidationKey");
    expect(registration).toContain("validationMessage");
  });

  it("does not leave the previous fixed auth and lifecycle copy in route markup", () => {
    const forbiddenLiterals = [
      "Create your account",
      "Verify your email",
      "Reset your password",
      "Welcome back",
      "Set a new password",
      "Restore your account",
      "Account suspended",
      "Outlet manager invitation",
      "Manage one local outlet",
      "Register as Vendor",
      "Submit Application",
      "Unable to load demo accounts",
      "Please verify your email before continuing. You can resend the verification code below.",
      "If this address can be registered, a 6-digit verification code has been sent.",
      "If this address can be registered, a new verification code has been sent.",
      "If an account matches, password reset instructions have been sent.",
      "Use your email address or continue with Google. Demo accounts remain available below.",
      "Enter the 6-digit code sent to",
      "Email verification code",
      "Browse vendors and listings without signing in",
      "Seeded demo accounts",
      "Quick entry",
      "Demo records are stored in Supabase. The browser is not used as the database.",
      "Unable to restore account",
      "Unable to submit appeal",
      "Appeal submitted",
      "Account created. Confirm your email if required, then reopen this invitation link to accept it.",
      "Accept this invitation to manage the assigned outlet. You will not receive access to the vendor's other outlets.",
      "This invitation is no longer available. Ask the vendor owner to create a new invitation.",
      "This invitation was sent to",
      "Vendor application submitted for admin review.",
      "Network error — please try again",
      "Submit the basic business profile first.",
      "That code is invalid or has expired.",
      "Use the invited account",
      "Recommendation details",
      "Verify your personal mobile",
      "Review your application",
      "Vendor application submitted",
      "Vendor invitation inactive",
      "Step {stepNumber} of 3",
      "Simulation failed.",
      "Simulate purchase (demo only)",
      "No activities found.",
      "Prototype · not linked from the app",
      "District & discovery map",
      "Couldn’t load the catalogue.",
      "No available outlets or activities in",
      "Cover / hero banner",
      "Operating hours",
      "Replace",
      "…or paste an image URL",
      "Button label",
      "Closed",
      "Remove photo",
      "Add photo",
      "Product name",
      "Remove product",
      "Add product",
      "Promo title",
      "Remove review",
      "Add review",
      "Announcement text",
      "Remove link",
      "Add link",
    ];

    for (const path of CODE_FILES) {
      const contents = source(path);
      for (const literal of forbiddenLiterals) {
        expect(contents, `${path} still contains fixed English literal: ${literal}`).not.toContain(literal);
      }
    }
  });

  it("preserves auth, invitation, and development flow contracts while copy moves to resources", () => {
    const login = source("app/login/page.tsx");
    expect(login).toContain('provider: "google"');
    expect(login).toContain("/auth/callback?next=");
    expect(login).toContain("verifyOtp");

    const invitation = source("app/outlet-manager-invitations/[token]/page.tsx");
    expect(invitation).toContain("encodeURIComponent(params.token)");
    expect(invitation).toContain('method: "POST"');
    expect(invitation).toContain('router.push("/vendor/dashboard")');

    const wizard = source("components/vendor/vendor-invite-wizard.tsx");
    expect(wizard).toContain("submitGuidedVendorClaim");
    expect(wizard).toContain("VendorInvitePhoneStep");
    expect(wizard).toContain("window.sessionStorage.removeItem");

    const dev = source("app/dev/page.tsx");
    expect(dev).toContain("/api/dev/simulate-purchase");
    expect(dev).toContain("productId");
  });
});
