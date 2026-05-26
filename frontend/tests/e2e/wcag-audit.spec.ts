import * as fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function checkA11y(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
  return results;
}

test.describe("WCAG 2.2 AA Accessibility Audit", () => {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`Theme: ${theme}`, () => {
      test.use({ colorScheme: theme });

      test("Package Selection", async ({ page }) => {
        await page.goto("/");
        await expect(page.locator(".package-list-page")).toBeVisible();
        await page.waitForLoadState("networkidle");

        const results = await checkA11y(page);
        fs.writeFileSync(
          `axe-${theme}-selection.json`,
          JSON.stringify(results.violations, null, 2),
        );
      });

      test("Learning Mode", async ({ page }) => {
        await page.goto("/packages/phishing-and-email-security");
        await expect(page.locator(".lesson-page")).toBeVisible();
        await page.waitForLoadState("networkidle");

        const results = await checkA11y(page);
        fs.writeFileSync(
          `axe-${theme}-learning.json`,
          JSON.stringify(results.violations, null, 2),
        );
      });

      test("Test Mode - Difficulty Select", async ({ page }) => {
        await page.goto("/test/exam/phishing-and-email-security");
        await expect(
          page.locator(".test-mode-page__difficulty-card").first(),
        ).toBeVisible();
        await page.waitForLoadState("networkidle");

        const results = await checkA11y(page);
        fs.writeFileSync(
          `axe-${theme}-difficulty.json`,
          JSON.stringify(results.violations, null, 2),
        );
      });

      test("Test Mode - In Progress", async ({ page }) => {
        await page.goto("/test/exam/phishing-and-email-security");
        await page.getByRole("button", { name: /Normal/i }).click();
        await expect(page.locator(".question-card")).toBeVisible();
        await page.waitForLoadState("networkidle");

        const results = await checkA11y(page);
        fs.writeFileSync(
          `axe-${theme}-inprogress.json`,
          JSON.stringify(results.violations, null, 2),
        );
      });

      test("Results Screen", async ({ page }) => {
        await page.goto("/test/exam/phishing-and-email-security");
        await page.getByRole("button", { name: /Easy/i }).click();
        await expect(page.locator(".question-card")).toBeVisible();

        let i = 0;
        while (i < 20) {
          await expect(page.locator(".question-card__answer").first()).toBeVisible();
          await page.locator(".question-card__answer").first().click();

          if (await page.getByRole("button", { name: "Finish" }).isVisible()) {
            await page.getByRole("button", { name: "Finish" }).click();
            break;
          }

          const nextButton = page.getByRole("button", { name: "Next" });
          if (await nextButton.isVisible()) {
            await nextButton.click();
          } else {
            const nav = page.getByRole("button", {
              name: new RegExp(`Question ${i + 2}`, "i"),
            });
            if (await nav.isVisible()) {
              await nav.click();
            } else {
              await page.waitForTimeout(500);
              if (await page.getByRole("button", { name: "Finish" }).isVisible()) {
                await page.getByRole("button", { name: "Finish" }).click();
                break;
              }
            }
          }

          i += 1;
        }

        await expect(
          page.getByRole("heading", { name: /Test Complete/i }),
        ).toBeVisible();
        await page.waitForLoadState("networkidle");

        const results = await checkA11y(page);
        fs.writeFileSync(
          `axe-${theme}-results.json`,
          JSON.stringify(results.violations, null, 2),
        );
      });
    });
  }
});
