import { expect, test } from "@playwright/test";

const MOCK_PACKAGE_ID = "python-basics";
const API_BASE_URL = "http://localhost:8000";

const MOCK_SUMMARY = {
  id: MOCK_PACKAGE_ID,
  title: "Python Basics",
  description: "Learn Python fundamentals.",
  version: "1.0.0",
  tags: ["python"],
  passing_score: 0.75,
  page_count: 2,
  question_count: 4,
};

const MOCK_FULL_PACKAGE = {
  id: MOCK_PACKAGE_ID,
  title: "Python Basics",
  description: "Learn Python fundamentals.",
  version: "1.0.0",
  tags: ["python"],
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

test.describe("Test Mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${API_BASE_URL}/packages/${MOCK_PACKAGE_ID}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_FULL_PACKAGE),
      });
    });

    await page.route(`${API_BASE_URL}/packages`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([MOCK_SUMMARY]),
      });
    });
  });

  test("difficulty selection screen shows on navigate to test exam route", async ({
    page,
  }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await expect(
      page.getByRole("heading", { name: "Python Basics" }),
    ).toBeVisible();
    await expect(
      page.getByText("Choose your difficulty to begin the timed exam."),
    ).toBeVisible();
  });

  test("all four difficulty options are visible", async ({ page }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await expect(page.getByRole("button", { name: /Easy/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Normal/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Hard/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Expert/i })).toBeVisible();
  });

  test("selecting Normal difficulty shows exam view with timer", async ({
    page,
  }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await page.getByRole("button", { name: /Normal/i }).click();
    await expect(
      page.getByLabel(/minutes .* seconds remaining/i),
    ).toBeVisible();
    await expect(page.getByText(/Question 1 of 4/i)).toBeVisible();
  });

  test("timer displays in MM:SS format", async ({ page }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await page.getByRole("button", { name: /Normal/i }).click();
    await expect(page.getByText(/^\d{2}:\d{2}$/)).toBeVisible();
  });

  test("clicking an answer marks the question dot as answered", async ({
    page,
  }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await page.getByRole("button", { name: /Normal/i }).click();

    await page.locator(".question-card__answer").first().click();
    await page.getByRole("button", { name: "Question 2, unanswered" }).click();

    await expect(
      page.getByRole("button", { name: "Question 1, answered" }),
    ).toBeVisible();
  });

  test("flag button toggles flag indicator", async ({ page }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await page.getByRole("button", { name: /Normal/i }).click();

    await page
      .getByRole("button", { name: /Flag question for review/i })
      .click();
    await page.getByRole("button", { name: "Question 2, unanswered" }).click();

    await expect(
      page.getByRole("button", { name: "Question 1, flagged" }),
    ).toBeVisible();
  });

  test("navigating via dot shows different question", async ({ page }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await page.getByRole("button", { name: /Normal/i }).click();

    await page.getByRole("button", { name: "Question 2, unanswered" }).click();
    await expect(page.getByText("Question 2 of 4")).toBeVisible();
  });

  test("previous answer is preserved when navigating back", async ({
    page,
  }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await page.getByRole("button", { name: /Normal/i }).click();

    const firstAnswer = page.locator(".question-card__answer").first();
    const firstAnswerText = await firstAnswer.textContent();
    await firstAnswer.click();

    await page.getByRole("button", { name: "Question 2, unanswered" }).click();
    await page
      .getByRole("button", { name: /Question 1, (current|answered)/i })
      .click();

    await expect(
      page.getByRole("button", {
        name: firstAnswerText?.trim() || "",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("clicking submit after answering all questions shows results screen", async ({
    page,
  }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await page.getByRole("button", { name: /Normal/i }).click();

    for (let index = 0; index < 4; index++) {
      await page
        .getByRole("button", { name: new RegExp(`Question ${index + 1}`) })
        .click();
      await page.locator(".question-card__answer").first().click();
    }

    await page.getByRole("button", { name: "Submit" }).click();
    await expect(
      page.getByRole("heading", { name: "Test Complete" }),
    ).toBeVisible();
  });

  test("results screen shows score percentage", async ({ page }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await page.getByRole("button", { name: /Normal/i }).click();

    for (let index = 0; index < 4; index++) {
      await page
        .getByRole("button", { name: new RegExp(`Question ${index + 1}`) })
        .click();
      await page.locator(".question-card__answer").first().click();
    }

    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.locator(".test-results__score")).toContainText(/\d+%/);
  });

  test("timer expiry auto-submits exam and shows results screen", async ({
    page,
  }) => {
    const shortTimerPackage = {
      ...MOCK_FULL_PACKAGE,
      questions: [MOCK_FULL_PACKAGE.questions[0]],
    };

    await page.route(`${API_BASE_URL}/packages/${MOCK_PACKAGE_ID}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(shortTimerPackage),
      });
    });

    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await page.getByRole("button", { name: /Expert/i }).click();
    await expect(page.getByText("00:10")).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "Time's Up!" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Time's up - exam auto-submitted"),
    ).toBeVisible();
  });

  test("navigating to nonexistent package redirects to home", async ({
    page,
  }) => {
    await page.unrouteAll({ behavior: "wait" });
    await page.route(`${API_BASE_URL}/packages/nonexistent`, (route) => {
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Package not found" }),
      });
    });

    await page.route(`${API_BASE_URL}/packages`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([MOCK_SUMMARY]),
      });
    });

    await page.goto("/test/exam/nonexistent");
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Local Learning Engine" }),
    ).toBeVisible();
  });
});
