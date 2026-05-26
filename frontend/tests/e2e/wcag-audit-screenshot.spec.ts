import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function checkA11y(page: import("@playwright/test").Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
}

test("Check where navigation goes", async ({ page }) => {
  await page.goto("/test/exam/phishing-and-email-security");
  await checkA11y(page);
  await page.screenshot({ path: "test-screenshot.png" });
  console.log(await page.url());
});
