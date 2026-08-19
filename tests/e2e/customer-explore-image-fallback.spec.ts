import { expect, test } from "@playwright/test";

test("Explore handles missing catalogue images without rendering an empty src", async ({ page }) => {
  const emptySrcErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("empty string") && message.text().includes("src attribute")) {
      emptySrcErrors.push(message.text());
    }
  });

  await page.goto("/customer/explore");
  await expect(page.getByText("Malaysia experiences")).toBeVisible();
  await page.waitForTimeout(250);

  expect(emptySrcErrors).toEqual([]);
});
