import * as fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const API_BASE_URL = "http://localhost:8000";
const PACKAGE_ID = "phishing-and-email-security";

const MOCK_PACKAGE = {
  id: PACKAGE_ID,
  title: "Phishing and Email Security",
  description: "Identify common phishing patterns and respond safely.",
  version: "1.0.0",
  tags: ["security", "email"],
  passing_score: 0.75,
  page_count: 2,
  question_count: 2,
  pages: [
    {
      id: "p1",
      title: "Spotting Suspicious Senders",
      content: "Always verify sender domains and context before clicking links.",
    },
    {
      id: "p2",
      title: "Reporting Procedure",
      content: "Report suspicious messages through your approved security channel.",
    },
  ],
  questions: [
    {
      id: "q1",
      text: "What is a common phishing signal?",
      answers: [
        { id: "a1", text: "Unexpected urgent request" },
        { id: "a2", text: "Known internal sender on approved domain" },
      ],
      correct_answer: "a1",
      weight: 50,
      feedback: "Urgent pressure is a classic phishing tactic.",
      revision_page_ids: ["p1"],
    },
    {
      id: "q2",
      text: "What should you do with a suspicious email?",
      answers: [
        { id: "b1", text: "Report it through the official channel" },
        { id: "b2", text: "Forward it to everyone for awareness" },
      ],
      correct_answer: "b1",
      weight: 50,
      feedback: "Use the official reporting process.",
      revision_page_ids: ["p2"],
    },
  ],
};

async function checkA11y(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
  return results;
}

test.describe("WCAG 2.2 AA Accessibility Audit", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${API_BASE_URL}/packages`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: MOCK_PACKAGE.id,
            title: MOCK_PACKAGE.title,
            description: MOCK_PACKAGE.description,
            version: MOCK_PACKAGE.version,
            tags: MOCK_PACKAGE.tags,
            passing_score: MOCK_PACKAGE.passing_score,
            page_count: MOCK_PACKAGE.page_count,
            question_count: MOCK_PACKAGE.question_count,
          },
        ]),
      });
    });

    await page.route(`${API_BASE_URL}/packages/${PACKAGE_ID}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PACKAGE),
      });
    });
  });

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
