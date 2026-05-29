import AxeBuilder from "@axe-core/playwright";
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

const MOCK_TWO_QUESTION_PACKAGE = {
  ...MOCK_FULL_PACKAGE,
  question_count: 2,
  questions: [
    {
      id: "q1",
      text: "What is Python?",
      answers: [
        { id: "a1", text: "A programming language" },
        { id: "a2", text: "A snake" },
      ],
      correct_answer: "a1",
      weight: 50,
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
      weight: 50,
      feedback: "Variables store data values.",
      revision_page_ids: [],
    },
  ],
};

const MOCK_TAGGED_PACKAGE = {
  id: "tagged-pkg",
  title: "Tagged Package",
  description: "A tagged package",
  version: "1.0.0",
  tags: [],
  passing_score: 0.7,
  estimated_minutes: 5,
  pages: [{ id: "p1", title: "Page One", content: "Content" }],
  questions: [
    {
      id: "q-easy-1",
      text: "Easy question one?",
      difficulty: "easy",
      answers: [
        { id: "a", text: "Correct" },
        { id: "b", text: "Incorrect" },
      ],
      correct_answer: "a",
      weight: 50,
      feedback: "Easy feedback",
      revision_page_ids: [],
    },
    {
      id: "q-easy-2",
      text: "Easy question two?",
      difficulty: "easy",
      answers: [
        { id: "a", text: "Correct" },
        { id: "b", text: "Incorrect" },
      ],
      correct_answer: "a",
      weight: 50,
      feedback: "Easy feedback",
      revision_page_ids: [],
    },
    {
      id: "q-expert-1",
      text: "Expert question one?",
      difficulty: "expert",
      answers: [
        { id: "a", text: "Correct" },
        { id: "b", text: "Incorrect" },
      ],
      correct_answer: "a",
      weight: 50,
      feedback: "Expert feedback",
      revision_page_ids: [],
    },
    {
      id: "q-expert-2",
      text: "Expert question two?",
      difficulty: "expert",
      answers: [
        { id: "a", text: "Correct" },
        { id: "b", text: "Incorrect" },
      ],
      correct_answer: "a",
      weight: 50,
      feedback: "Expert feedback",
      revision_page_ids: [],
    },
  ],
};

const MOCK_LEGACY_PACKAGE = {
  id: "legacy-pkg",
  title: "Legacy Package",
  description: "A legacy package",
  version: "1.0.0",
  tags: [],
  passing_score: 0.7,
  estimated_minutes: 5,
  pages: [{ id: "p1", title: "Page One", content: "Content" }],
  questions: [
    {
      id: "q-legacy-1",
      text: "Legacy question one?",
      answers: [
        { id: "a", text: "Correct" },
        { id: "b", text: "Incorrect" },
      ],
      correct_answer: "a",
      weight: 50,
      feedback: "Legacy feedback",
      revision_page_ids: [],
    },
    {
      id: "q-legacy-2",
      text: "Legacy question two?",
      answers: [
        { id: "a", text: "Correct" },
        { id: "b", text: "Incorrect" },
      ],
      correct_answer: "a",
      weight: 50,
      feedback: "Legacy feedback",
      revision_page_ids: [],
    },
  ],
};

const MOCK_HARD_ONLY_PACKAGE = {
  id: "hard-only-pkg",
  title: "Hard Only Package",
  description: "A hard-only package",
  version: "1.0.0",
  tags: [],
  passing_score: 0.7,
  estimated_minutes: 5,
  pages: [{ id: "p1", title: "Page One", content: "Content" }],
  questions: [
    {
      id: "q-hard-1",
      text: "Hard question one?",
      difficulty: "hard",
      answers: [
        { id: "a", text: "Correct" },
        { id: "b", text: "Incorrect" },
      ],
      correct_answer: "a",
      weight: 50,
      feedback: "Hard feedback",
      revision_page_ids: [],
    },
    {
      id: "q-hard-2",
      text: "Hard question two?",
      difficulty: "hard",
      answers: [
        { id: "a", text: "Correct" },
        { id: "b", text: "Incorrect" },
      ],
      correct_answer: "a",
      weight: 50,
      feedback: "Hard feedback",
      revision_page_ids: [],
    },
  ],
};

const toSummary = (pkg: {
  id: string;
  title: string;
  description: string;
  version: string;
  tags: string[];
  passing_score: number;
  pages: unknown[];
  questions: unknown[];
}) => ({
  id: pkg.id,
  title: pkg.title,
  description: pkg.description,
  version: pkg.version,
  tags: pkg.tags,
  passing_score: pkg.passing_score,
  page_count: pkg.pages.length,
  question_count: pkg.questions.length,
});

async function checkA11y(page: import("@playwright/test").Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
}

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
    await checkA11y(page);
    await expect(
      page.getByRole("heading", { name: "Python Basics" }),
    ).toBeVisible();
    await expect(
      page.getByText("Choose your difficulty to begin the timed exam."),
    ).toBeVisible();
  });

  test("all four difficulty options are visible", async ({ page }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await expect(page.getByRole("button", { name: /Easy/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Normal/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Hard/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Expert/i })).toBeVisible();
  });

  test("selecting Normal difficulty shows exam view with timer", async ({
    page,
  }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Normal/i }).click();
    await expect(
      page.getByLabel(/minutes .* seconds remaining/i),
    ).toBeVisible();
    await expect(page.getByText(/Question 1 of 4/i)).toBeVisible();
  });

  test("timer displays in MM:SS format", async ({ page }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Normal/i }).click();
    await expect(page.getByText(/^\d{2}:\d{2}$/)).toBeVisible();
  });

  test("easy mode only shows easy-tagged questions", async ({ page }) => {
    await page.route(`${API_BASE_URL}/packages/tagged-pkg`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_TAGGED_PACKAGE),
      });
    });

    await page.route(`${API_BASE_URL}/packages`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([toSummary(MOCK_TAGGED_PACKAGE)]),
      });
    });

    await page.goto("/test/exam/tagged-pkg");
    await checkA11y(page);
    await page.getByRole("button", { name: /Easy/i }).click();

    await expect(page.getByText(/Easy question (one|two)\?/)).toBeVisible();
    await expect(page.getByText("Expert question one?")).toHaveCount(0);
    await expect(page.getByText("Expert question two?")).toHaveCount(0);
  });

  test("expert mode only shows expert-tagged questions", async ({ page }) => {
    await page.route(`${API_BASE_URL}/packages/tagged-pkg`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_TAGGED_PACKAGE),
      });
    });

    await page.route(`${API_BASE_URL}/packages`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([toSummary(MOCK_TAGGED_PACKAGE)]),
      });
    });

    await page.goto("/test/exam/tagged-pkg");
    await checkA11y(page);
    await page.getByRole("button", { name: /Expert/i }).click();
    await page.getByRole("button", { name: "Confirm — Start Exam" }).click();

    await expect(page.getByText(/Expert question (one|two)\?/)).toBeVisible();
    await expect(page.getByText("Easy question one?")).toHaveCount(0);
    await expect(page.getByText("Easy question two?")).toHaveCount(0);
  });

  test("legacy untagged package shows all questions regardless of difficulty", async ({
    page,
  }) => {
    await page.route(`${API_BASE_URL}/packages/legacy-pkg`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_LEGACY_PACKAGE),
      });
    });

    await page.route(`${API_BASE_URL}/packages`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([toSummary(MOCK_LEGACY_PACKAGE)]),
      });
    });

    await page.goto("/test/exam/legacy-pkg");
    await checkA11y(page);
    await page.getByRole("button", { name: /Easy/i }).click();

    await expect(page.getByText(/Legacy question (one|two)\?/)).toBeVisible();
  });

  test("falls back to all questions when chosen difficulty has no tagged questions", async ({
    page,
  }) => {
    await page.route(`${API_BASE_URL}/packages/hard-only-pkg`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_HARD_ONLY_PACKAGE),
      });
    });

    await page.route(`${API_BASE_URL}/packages`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([toSummary(MOCK_HARD_ONLY_PACKAGE)]),
      });
    });

    await page.goto("/test/exam/hard-only-pkg");
    await checkA11y(page);
    await page.getByRole("button", { name: /Easy/i }).click();

    await expect(page.getByText(/Hard question (one|two)\?/)).toBeVisible();
  });

  test.describe("Phase B behaviour", () => {
    test("score percentage never exceeds 100%", async ({ page }) => {
      await page.route(
        `${API_BASE_URL}/packages/${MOCK_PACKAGE_ID}`,
        (route) => {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(MOCK_TWO_QUESTION_PACKAGE),
          });
        },
      );

      await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
      await checkA11y(page);
      await page.getByRole("button", { name: /Normal/i }).click();

      await page.locator(".question-card__answer").first().click();
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByRole("button", { name: "Finish" }).click();

      await expect(
        page.getByRole("heading", { name: "Test Complete" }),
      ).toBeVisible();
      const scoreText = await page
        .locator(".test-results__score")
        .textContent();
      expect(scoreText).toMatch(/^\d{1,3}%$/);

      const scoreValue = Number(scoreText?.replace("%", ""));
      expect(scoreValue).toBeLessThanOrEqual(100);
    });

    test('"Finish" appears on the last question and "Next" does not', async ({
      page,
    }) => {
      await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
      await checkA11y(page);
      await page.getByRole("button", { name: /Easy/i }).click();

      await page.getByRole("button", { name: /Question 4,/i }).click();
      await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Next" })).toBeHidden();
    });

    test('"Next" appears on non-last questions and "Finish" does not', async ({
      page,
    }) => {
      await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
      await checkA11y(page);
      await page.getByRole("button", { name: /Easy/i }).click();

      await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Finish" })).toBeHidden();
    });

    test("zero-answer submit warning appears and can be cancelled", async ({
      page,
    }) => {
      await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
      await checkA11y(page);
      await page.getByRole("button", { name: /Easy/i }).click();

      await page.getByRole("button", { name: /Question 4,/i }).click();
      await page.getByRole("button", { name: "Finish" }).click();
      await expect(
        page.getByText("You haven't answered any questions", { exact: false }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(
        page.getByText("You haven't answered any questions", { exact: false }),
      ).toHaveCount(0);
      await expect(page.getByText(/Question 4 of 4/i)).toBeVisible();
    });

    test("Hard difficulty shows pre-start warning phase", async ({ page }) => {
      await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
      await checkA11y(page);
      await page.getByRole("button", { name: /Hard/i }).click();

      await expect(
        page.locator(".test-mode-page__warning-callout"),
      ).toBeVisible();
      await expect(page.getByText(/If you leave or cancel/i)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Confirm — Start Exam" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Choose a different difficulty" }),
      ).toBeVisible();

      await page
        .getByRole("button", { name: "Choose a different difficulty" })
        .click();

      await expect(
        page.getByText("Choose your difficulty to begin the timed exam."),
      ).toBeVisible();
      await expect(
        page.locator(".test-mode-page__difficulty-card"),
      ).toHaveCount(4);
    });

    test("confirming Hard difficulty starts exam", async ({ page }) => {
      await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
      await checkA11y(page);
      await page.getByRole("button", { name: /Hard/i }).click();
      await page.getByRole("button", { name: "Confirm — Start Exam" }).click();

      await expect(page.getByText(/Question 1 of 4/i)).toBeVisible();
      await expect(
        page.getByLabel(/minutes .* seconds remaining/i),
      ).toBeVisible();
    });

    test("few-answer Hard warning mentions 50 XP deduction", async ({
      page,
    }) => {
      await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
      await checkA11y(page);
      await page.getByRole("button", { name: /Hard/i }).click();
      await page.getByRole("button", { name: "Confirm — Start Exam" }).click();

      await page.locator(".question-card__answer").first().click();
      await page.getByRole("button", { name: /Question 4,/i }).click();
      await page.getByRole("button", { name: "Finish" }).click();

      await expect(page.getByText(/deduct 50 XP/i)).toBeVisible();
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByText(/deduct 50 XP/i)).toHaveCount(0);
      await expect(page.getByText(/Question 4 of 4/i)).toBeVisible();
    });
  });

  test("clicking an answer marks the question dot as answered", async ({
    page,
  }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Normal/i }).click();

    await page.locator(".question-card__answer").first().click();
    await page.getByRole("button", { name: "Question 2, unanswered" }).click();

    await expect(
      page.getByRole("button", { name: "Question 1, answered" }),
    ).toBeVisible();
  });

  test("flag button toggles flag indicator", async ({ page }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
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
    await checkA11y(page);
    await page.getByRole("button", { name: /Normal/i }).click();

    await page.getByRole("button", { name: "Question 2, unanswered" }).click();
    await expect(page.getByText("Question 2 of 4")).toBeVisible();
  });

  test("previous answer is preserved when navigating back", async ({
    page,
  }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
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

  test("clicking finish after answering all questions shows results screen", async ({
    page,
  }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Normal/i }).click();

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
    await expect(
      page.getByRole("heading", { name: "Test Complete" }),
    ).toBeVisible();
  });

  test("results screen shows score percentage", async ({ page }) => {
    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Normal/i }).click();

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
    await checkA11y(page);
    await page.getByRole("button", { name: /Expert/i }).click();
    await page.getByRole("button", { name: "Confirm — Start Exam" }).click();
    await expect(page.getByText("00:10")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Time's Up!" })).toBeVisible(
      {
        timeout: 15_000,
      },
    );
    await expect(
      page.getByText("Time's up - exam auto-submitted"),
    ).toBeVisible();
  });

  test("authenticated test mode uses server attempt metadata and skips localStorage metadata keys", async ({
    page,
  }) => {
    const authUser = {
      id: 88,
      username: "test-user",
      email: "test-user@example.com",
      role: "student",
      xp: 10,
      created_at: "2026-05-23T00:00:00Z",
    };
    const progressRow = {
      package_id: MOCK_PACKAGE_ID,
      latest_weighted_score: 0.5,
      completed: true,
      attempt_count: 2,
      first_completed_at: "2026-05-23T09:00:00Z",
      updated_at: "2026-05-23T09:00:00Z",
    };

    let capturedAttemptCount: number | null = null;
    let streakMarkCalls = 0;

    await page.addInitScript(() => {
      sessionStorage.setItem("lle_auth_token", "test-mode-auth-token");
      localStorage.removeItem("lle_attempt_test_python-basics");
      localStorage.removeItem("lle_completed_test_python-basics");
    });

    await page.route(`${API_BASE_URL}/users/me`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(authUser),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/progress`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([progressRow]),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/streak`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          streak_count: 2,
          last_practised_date: "2026-05-23",
        }),
      });
    });

    await page.route(
      `${API_BASE_URL}/users/me/streak/mark-practised`,
      (route) => {
        streakMarkCalls += 1;
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            streak_count: 3,
            last_practised_date: "2026-05-24",
          }),
        });
      },
    );

    await page.route(
      `${API_BASE_URL}/users/me/progress/${MOCK_PACKAGE_ID}`,
      async (route) => {
        const payload = route.request().postDataJSON() as {
          latest_weighted_score: number;
          completed: boolean;
          attempt_count?: number;
        };
        capturedAttemptCount = payload.attempt_count ?? null;

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...progressRow,
            latest_weighted_score: payload.latest_weighted_score,
            completed: payload.completed,
            attempt_count: payload.attempt_count ?? progressRow.attempt_count,
            updated_at: "2026-05-24T10:00:00Z",
          }),
        });
      },
    );

    await page.goto(`/test/exam/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
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
    await expect(
      page.getByRole("heading", { name: "Test Complete" }),
    ).toBeVisible();

    await expect.poll(() => capturedAttemptCount).toBe(3);
    await expect.poll(() => streakMarkCalls).toBe(1);

    const localMetadata = await page.evaluate(() => ({
      attempt: localStorage.getItem("lle_attempt_test_python-basics"),
      firstCompletion: localStorage.getItem("lle_completed_test_python-basics"),
    }));
    expect(localMetadata.attempt).toBeNull();
    expect(localMetadata.firstCompletion).toBeNull();
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
    await checkA11y(page);
    await expect(page).toHaveURL("/");
    await expect(
      page.getByTestId("app-top-bar").getByRole("link", { name: "Go to home" }),
    ).toBeVisible();
  });
});
