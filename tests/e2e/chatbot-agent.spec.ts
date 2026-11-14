import { expect, test, type Page } from "@playwright/test";

// Customer chatbot agent (lib/chatbot/agent.ts), driven as a guest. Guests have
// no orders, so no refund can be sent from here. Replies come from the live
// model, so assertions check the shape of the reply, not exact wording. The
// live model can stall, so this spec depends on the retries in callGeminiAgent.

type AskBody = {
  data: { answer: string; botAnswered: boolean; listings: { id: string; href: string }[]; comparison: unknown[] | null; refunds: unknown[] } | null;
};

async function openChat(page: Page) {
  await page.goto("/customer");
  await page.getByRole("button", { name: "Open chat", exact: true }).click();
  // Open the support conversation; the composer only shows once it is selected.
  await page.getByText("MYLawatan Support", { exact: true }).click();
}

async function ask(page: Page, question: string): Promise<AskBody> {
  const input = page.getByPlaceholder("Ask a question…");
  await input.fill(question);
  const response = page.waitForResponse((r) => r.url().includes("/api/chatbot/ask") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  return (await (await response).json()) as AskBody;
}

test.describe("customer chatbot agent (guest)", () => {
  test.setTimeout(120_000);

  test("finds listings and shows them as links", async ({ page }) => {
    await openChat(page);
    const body = await ask(page, "Where can I find food to eat?");
    expect(body.data?.answer).toBeTruthy();
    expect(body.data!.listings.length).toBeGreaterThan(0);
    for (const listing of body.data!.listings) expect(listing.href).toMatch(/^\/customer\/products\//);
    await expect(page.locator('a[href^="/customer/products/"]').first()).toBeVisible();
  });

  test("compares listings in a table", async ({ page }) => {
    await openChat(page);
    const body = await ask(page, "Compare the two cheapest food items for me");
    expect(body.data?.answer).toBeTruthy();
    expect(body.data!.comparison?.length ?? 0).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole("table").last()).toBeVisible();
  });

  test("recommends from the site's listings", async ({ page }) => {
    await openChat(page);
    const body = await ask(page, "Recommend something to do in Penang");
    expect(body.data?.answer).toBeTruthy();
    expect(body.data!.refunds).toEqual([]);
  });

  test("refuses off-topic questions", async ({ page }) => {
    await openChat(page);
    const body = await ask(page, "Write me a poem about the moon");
    expect(body.data?.answer).toBeTruthy();
    expect(body.data!.listings).toEqual([]);
    expect(body.data!.comparison).toBeNull();
    expect(body.data!.answer.toLowerCase()).not.toContain("moon");
  });

  test("asks a guest to sign in for refunds and shows no refund card", async ({ page }) => {
    await openChat(page);
    const body = await ask(page, "Please refund my last order");
    expect(body.data?.answer).toBeTruthy();
    expect(body.data!.refunds).toEqual([]);
    await expect(page.locator("[data-chatbot-refund]")).toHaveCount(0);
  });
});
