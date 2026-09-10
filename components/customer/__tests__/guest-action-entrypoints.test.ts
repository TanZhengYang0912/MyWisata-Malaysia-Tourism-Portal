import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync(new URL("../../../app/customer/layout.tsx", import.meta.url), "utf8");
const chat = readFileSync(new URL("../outlet-chat-button.tsx", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../customer-capability-gate-dialog.tsx", import.meta.url), "utf8");
const storyMap = readFileSync(new URL("../../demo-map/story-map.tsx", import.meta.url), "utf8");

describe("guest action entrypoint wiring", () => {
  it("gates map saves before optimistic wishlist updates", () => {
    expect(storyMap).toContain("if (!gate(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION)) return; void toggleSaved(selectedActivity.id);");
  });

  it("mounts notification data controls only for a signed-in customer", () => {
    expect(layout).toContain("currentUser ? <NotificationBell key={currentUser.id} />");
    expect(layout).toContain('gate(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION, "/customer/notifications")');
  });

  it("uses the same capability gate for private links and direct guest arrivals", () => {
    expect(layout).not.toContain("guestSafeHref");
    expect(layout).toContain("onClickCapture={confirmGuestNavigation}");
    expect(layout).toContain("onAuxClickCapture={confirmGuestNavigation}");
    expect(layout).toContain("event.preventDefault()");
    expect(layout).toContain("event.stopPropagation()");
    expect(layout).toContain("guestProtectedCustomerPath");
    expect(layout).toContain("gate(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION, nextPath)");
    expect(layout).toContain("allowUnauthenticated: true");
    expect(layout).toContain("const guestBlocked = !currentUser && !isPublicCustomerPath(pathname);");
    expect(layout).toContain("gate(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION, `${pathname}${window.location.search}${window.location.hash}`)");
    expect(layout).toContain("GuestAccountEmptyState");
    expect(layout).toContain("guestBlocked ? (");
  });

  it("blocks guest outlet chat before POST instead of directly navigating to login", () => {
    expect(chat).not.toContain('router.push("/login")');
    expect(chat).toContain("if (!gate(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION)) return;");
    expect(chat.indexOf("if (!gate(")).toBeLessThan(chat.indexOf('fetch("/api/customer/chat"'));
  });

  it("keeps recovery navigation inside explicit confirmation handlers", () => {
    expect(dialog).toContain('blockerCode === "SIGN_IN_REQUIRED" ? "ui.capabilityGate.continueBrowsing"');
    expect(dialog).toContain("onClick={() => {\n                  setRequest(null);\n                  router.push(action.href);");
    expect(dialog).toContain("onOpenChange={(open) => { if (!open) setRequest(null); }}");
  });
});
