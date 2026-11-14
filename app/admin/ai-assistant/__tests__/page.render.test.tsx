import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/providers/auth", () => ({
  useAuth: () => ({ currentUser: { role: "super_admin" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import AdminAiAssistantPage from "@/app/admin/ai-assistant/page";
import { AdminAiMessage } from "@/components/admin/admin-ai-message";
import { AdminAiChoiceTable } from "@/components/admin/admin-ai-action-card";

describe("Admin AI Assistant presentation", () => {
  it("fills the Admin content width while keeping readable chat columns", () => {
    const markup = renderToStaticMarkup(<AdminAiAssistantPage />);
    const cardClasses = markup.match(/data-slot="card" class="([^"]+)"/)?.[1].split(" ") ?? [];

    expect(cardClasses).toContain("w-full");
    expect(cardClasses).not.toContain("max-w-5xl");
    // Message column stays max-w-3xl; the composer is deliberately narrower
    // (max-w-xl) — a one-line question box that wide read as oversized.
    expect(markup.match(/max-w-3xl/g)).toHaveLength(1);
    expect(markup).toContain("max-w-xl");
    expect(markup).toContain("height:calc(100vh - 12rem)");
    expect(markup).toContain("[&amp;:last-child]:pb-0");
  });

  it("only offers Clear chat once there's a conversation to clear", () => {
    const emptyMarkup = renderToStaticMarkup(<AdminAiAssistantPage />);
    expect(emptyMarkup).not.toContain("aiAssistant.ask.clear");
  });

  it("places AI messages on the left and admin messages on the right", () => {
    const botMarkup = renderToStaticMarkup(<AdminAiMessage role="bot" text="Platform answer" />);
    const userMarkup = renderToStaticMarkup(<AdminAiMessage role="user" text="My question" />);

    expect(botMarkup).toContain('data-message-role="bot"');
    expect(botMarkup).toContain("justify-start");
    expect(botMarkup).not.toContain("justify-end");
    expect(userMarkup).toContain('data-message-role="user"');
    expect(userMarkup).toContain("justify-end");
    expect(userMarkup).not.toContain("justify-start");
    expect(botMarkup).toContain("max-w-[85%]");
    expect(botMarkup).toContain("lg:max-w-3xl");
    expect(userMarkup).toContain("max-w-[85%]");
    expect(userMarkup).toContain("lg:max-w-3xl");
  });

  it("shows offered choices as a table of on/off switches with nothing saved yet", () => {
    const request = { method: "PATCH" as const, url: "/api/admin/hotel-amenities", body: { code: "wifi" } };
    const markup = renderToStaticMarkup(
      <AdminAiChoiceTable choices={{ id: "t1", action: "set_hotel_amenity_active", rows: [{ key: "wifi", label: "Free Wi-Fi", active: false, request }] }} />,
    );

    expect(markup).toContain("<table");
    expect(markup).toContain('role="switch"');
    expect(markup).toContain("Free Wi-Fi");
    expect(markup).not.toContain("checked");
    // Save stays disabled until a switch is flipped.
    expect(markup).toMatch(/<button[^>]*disabled/);
  });

  it("keeps the message renderer out of the App Router page exports", async () => {
    const pageModule = await import("@/app/admin/ai-assistant/page");

    expect(pageModule).not.toHaveProperty("AdminAiMessage");
  });
});
