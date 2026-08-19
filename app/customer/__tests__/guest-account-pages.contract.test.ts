import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("guest account page boundaries", () => {
  it.each([
    "app/customer/cart/page.tsx",
    "components/customer/customer-orders-view.tsx",
    "app/customer/orders/[id]/page.tsx",
    "components/customer/customer-calendar-view.tsx",
    "app/customer/bookings/[id]/page.tsx",
    "app/customer/chat/page.tsx",
    "app/customer/chat/[threadId]/page.tsx",
    "app/customer/notifications/page.tsx",
    "app/customer/support/page.tsx",
    "app/customer/support/[id]/page.tsx",
  ])("renders an intentional Guest state in %s", (path) => {
    expect(read(path)).toContain("GuestAccountEmptyState");
  });

  it("renders an intentional signed-out state on the canonical saved page", () => {
    const source = read("app/customer/saved/page.tsx");
    expect(source).toContain("if (!user)");
    expect(source).toContain("ui.saved.signInTitle");
    expect(source).toContain("<EmptyState");
  });

  it.each([
    ["components/customer/customer-orders-view.tsx", "setOrders([])"],
    ["components/customer/customer-calendar-view.tsx", "setBookings([])"],
    ["app/customer/chat/page.tsx", "setMessagesByThread(new Map())"],
  ])("clears page-local account state in %s", (path, reset) => {
    const source = read(path);
    expect(source).toContain("loadedUserId");
    expect(source).toContain(reset);
  });

  it("guards direct order and booking refund actions", () => {
    const order = read("app/customer/orders/[id]/page.tsx");
    const booking = read("app/customer/bookings/[id]/page.tsx");
    expect(order.slice(order.indexOf("async function requestRefund"))).toContain("if (!currentUser");
    expect(booking.slice(booking.indexOf("async function requestRefund"))).toContain("if (!currentUser");
  });

  it("does not load, subscribe, or join presence for a Guest chat thread", () => {
    const source = read("app/customer/chat/[threadId]/page.tsx");
    expect(source).toContain('useChatPresence(thread ? `chat-presence-vendor-${thread.vendorId}` : undefined, currentUser?.id');
    expect(source).toContain("if (!currentUser || !params.threadId)");
    expect(source).toContain("if (!currentUser || !thread) return");
  });

  it("guards support reads and mutations with the current identity", () => {
    const list = read("app/customer/support/page.tsx");
    const detail = read("app/customer/support/[id]/page.tsx");
    expect(list.indexOf("if (!currentUser)")).toBeLessThan(list.indexOf('fetch("/api/support/tickets")'));
    expect(list.slice(list.indexOf("async function submitWithdrawalTicket"))).toContain("if (!currentUser");
    expect(detail.slice(detail.indexOf("async function loadTicket"))).toContain("if (!currentUser");
    expect(detail.slice(detail.indexOf("async function sendReply"))).toContain("if (!currentUser");
    expect(detail.slice(detail.indexOf("async function reopenTicket"))).toContain("if (!currentUser");
  });

  it("disables the notification center for a Guest", () => {
    const source = read("app/customer/notifications/page.tsx");
    expect(source).toContain("enabled={Boolean(currentUser)}");
  });
});
