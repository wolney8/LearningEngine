import { type Page, expect, test } from "@playwright/test";

const API_BASE_URL = "http://localhost:8000";

const MOCK_PACKAGES = [
  {
    id: "python-basics",
    title: "Python Basics",
    description: "Learn Python fundamentals.",
    version: "1.0.0",
    tags: ["python", "beginner"],
    passing_score: 0.75,
    page_count: 3,
    question_count: 4,
  },
];

const MOCK_FULL_PACKAGE = {
  id: "python-basics",
  title: "Python Basics",
  description: "Learn Python fundamentals.",
  version: "1.0.0",
  tags: ["python", "beginner"],
  passing_score: 0.75,
  pages: [
    {
      id: "p1",
      title: "Introduction",
      content: "Python is a versatile language.",
    },
    { id: "p2", title: "Variables", content: "Variables store data." },
  ],
  questions: [
    {
      id: "q1",
      text: "What is Python?",
      answers: [
        { id: "a1", text: "A programming language" },
        { id: "a2", text: "A snake" },
      ],
      correct_answer: "a1",
      weight: 0.25,
      feedback: "Python is indeed a programming language.",
      revision_page_ids: [],
    },
    {
      id: "q2",
      text: "What do variables do?",
      answers: [
        { id: "b1", text: "Store data" },
        { id: "b2", text: "Delete data" },
      ],
      correct_answer: "b1",
      weight: 0.25,
      feedback: "Variables store data values.",
      revision_page_ids: [],
    },
    {
      id: "q3",
      text: "What keyword defines a function in Python?",
      answers: [
        { id: "c1", text: "def" },
        { id: "c2", text: "fn" },
      ],
      correct_answer: "c1",
      weight: 0.25,
      feedback: "Functions are defined with def.",
      revision_page_ids: [],
    },
    {
      id: "q4",
      text: "What does len([1, 2, 3]) return?",
      answers: [
        { id: "d1", text: "3" },
        { id: "d2", text: "2" },
      ],
      correct_answer: "d1",
      weight: 0.25,
      feedback: "len returns number of items.",
      revision_page_ids: [],
    },
  ],
};

test.describe("Package Selection Screen", () => {
  const packageTitle = MOCK_PACKAGES[0].title;

  const getPackageCard = (page: Page, title: string) =>
    page.locator("article.package-card").filter({
      has: page.getByRole("heading", { name: new RegExp(title, "i") }),
    });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });

    // Default mock: backend returns one package.
    await page.route("**/packages", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PACKAGES),
      });
    });

    await page.route(`${API_BASE_URL}/packages/python-basics`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_FULL_PACKAGE),
      });
    });
  });

  test("heading is visible", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Local Learning Engine" }),
    ).toBeVisible();
  });

  test("renders a package card for each mocked package", async ({ page }) => {
    await page.goto("/");
    const card = getPackageCard(page, packageTitle);
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Start Learning" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Take Test" })).toBeVisible();
  });

  test("card shows page and question counts", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("3 pages")).toBeVisible();
    await expect(page.getByText("4 questions")).toBeVisible();
  });

  test("clicking a card navigates to the package detail URL", async ({ page }) => {
    await page.goto("/");
    const card = getPackageCard(page, packageTitle);
    await card.getByRole("button", { name: "Start Learning" }).click();
    await expect(page).toHaveURL(/\/packages\/python-basics/);
  });

  test("shows error state when backend returns 500", async ({ page }) => {
    await page.unrouteAll({ behavior: "wait" });
    await page.route("**/packages", (route) => {
      route.fulfill({ status: 500, body: "Internal Server Error" });
    });
    await page.goto("/");
    await expect(page.getByText(/Could not load packages/i)).toBeVisible();
  });

  test("shows empty state when backend returns empty array", async ({ page }) => {
    await page.unrouteAll({ behavior: "wait" });
    await page.route("**/packages", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
    await page.goto("/");
    await expect(page.getByText("No packages available.")).toBeVisible();
  });

  test("shows four not-attempted difficulty circles on each package card by default", async ({
    page,
  }) => {
    await page.goto("/");

    const card = getPackageCard(page, packageTitle);
    const circles = card.locator(".difficulty-circle");

    await expect(circles).toHaveCount(4);
    await expect(circles).toHaveClass([
      /difficulty-circle--not-attempted/,
      /difficulty-circle--not-attempted/,
      /difficulty-circle--not-attempted/,
      /difficulty-circle--not-attempted/,
    ]);
  });

  test("updates progress circle state and stats strip after completing an Easy test", async ({
    page,
  }) => {
    await page.goto("/");
    const card = getPackageCard(page, packageTitle);

    await card.getByRole("button", { name: "Take Test" }).click();
    await page.getByRole("button", { name: /Easy/i }).click();

    for (let index = 0; index < 4; index++) {
      await page
        .getByRole("button", { name: new RegExp(`Question ${index + 1}`) })
        .click();
      await page.locator(".question-card__answer").first().click();

      if (index < 3) {
        await page.getByRole("button", { name: "Next" }).click();
      }
    }

    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByRole("heading", { name: "Test Complete" })).toBeVisible();

    await page
      .locator(".test-results__actions")
      .getByRole("button", { name: "Back to packages", exact: true })
      .click();
    await expect(page).toHaveURL("/");

    const refreshedCard = getPackageCard(page, packageTitle);
    const easyCircle = refreshedCard.locator(
      '.difficulty-circle[data-difficulty="easy"]',
    );

    await expect(easyCircle).toBeVisible();
    await expect(easyCircle).toHaveClass(/difficulty-circle--(passed|attempted)/);

    const statsStrip = refreshedCard.locator(".package-stats-strip");
    await expect(statsStrip).toBeVisible();
    await expect(statsStrip).toContainText(/easy/i);
    await expect(statsStrip).toContainText(/\d+%/);
  });

  test("difficulty circles expose descriptive aria-label text", async ({ page }) => {
    await page.goto("/");

    const card = getPackageCard(page, packageTitle);
    const notAttemptedCircle = card
      .locator('.difficulty-circle[aria-label*="Not attempted"]')
      .first();

    await expect(notAttemptedCircle).toBeVisible();
    await expect(notAttemptedCircle).toHaveAttribute("aria-label", /Not attempted/);
  });
});
