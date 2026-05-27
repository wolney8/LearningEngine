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
  pages: [
    {
      id: "p1",
      title: "Spotting Suspicious Senders",
      content: "Always verify sender domains and context before clicking links.",
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
      weight: 100,
      feedback: "Urgent pressure is a classic phishing tactic.",
      revision_page_ids: ["p1"],
    },
  ],
};

async function checkA11y(page: import("@playwright/test").Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
}

test("Check where navigation goes", async ({ page }) => {
  await page.route(`${API_BASE_URL}/packages/${PACKAGE_ID}`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_PACKAGE),
    });
  });

  await page.goto("/test/exam/phishing-and-email-security");
  await checkA11y(page);
  await page.screenshot({ path: "test-screenshot.png" });
  console.log(await page.url());
});
