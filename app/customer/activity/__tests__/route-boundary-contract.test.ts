import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("customer activity route boundaries", () => {
  it("composes ordinary shared views instead of importing route entry modules", () => {
    const activityRoute = read("app/customer/activity/page.tsx");
    const calendarRoute = read("app/customer/calendar/page.tsx");
    const ordersRoute = read("app/customer/orders/page.tsx");

    expect(activityRoute).not.toMatch(/@\/app\/customer\/(calendar|orders)\/page/);
    expect(activityRoute).toContain("@/components/customer/customer-calendar-view");
    expect(activityRoute).toContain("@/components/customer/customer-orders-view");
    expect(calendarRoute).toContain("@/components/customer/customer-calendar-view");
    expect(ordersRoute).toContain("@/components/customer/customer-orders-view");
  });
});
