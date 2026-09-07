import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/providers/auth", () => ({
  useAuth: () => ({ currentUser: { role: "super_admin" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import AdminAiAssistantPage from "@/app/admin/ai-assistant/page";

describe("Admin AI Assistant presentation", () => {
  it("fills the Admin content width while keeping readable chat columns", () => {
    const markup = renderToStaticMarkup(<AdminAiAssistantPage />);
    const cardClasses = markup.match(/data-slot="card" class="([^"]+)"/)?.[1].split(" ") ?? [];

    expect(cardClasses).toContain("w-full");
    expect(cardClasses).not.toContain("max-w-5xl");
    expect(markup.match(/max-w-3xl/g)).toHaveLength(2);
    expect(markup).toContain("height:min(800px, calc(100vh - 18rem + 160px))");
  });

  it("places AI messages on the left and admin messages on the right", async () => {
    const pageModule = await import("@/app/admin/ai-assistant/page");
    const Message = (pageModule as unknown as {
      AdminAiMessage?: ComponentType<{ role: "user" | "bot"; text: string }>;
    }).AdminAiMessage;

    expect(Message).toBeTypeOf("function");
    if (!Message) return;

    const botMarkup = renderToStaticMarkup(<Message role="bot" text="Platform answer" />);
    const userMarkup = renderToStaticMarkup(<Message role="user" text="My question" />);

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
});
