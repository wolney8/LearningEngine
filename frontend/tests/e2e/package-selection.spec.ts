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
    availability: "available",
    enabled: true,
    xp_threshold: null,
  },
];

const MOCK_UNAVAILABLE_PACKAGE = {
  id: "unavailable-package",
  title: "Unavailable Package",
  description: "This package is unavailable by admin.",
  version: "1.0.0",
  tags: ["locked"],
  passing_score: 0.75,
  page_count: 1,
  question_count: 1,
  availability: "unavailable",
  enabled: false,
  xp_threshold: null,
};

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

const SEARCH_FILTER_PACKAGES = [
  {
    id: "python-completed",
    title: "Python Completed Path",
    description: "A finished package for advanced Python learners.",
    version: "1.0.0",
    tags: ["python", "advanced"],
    passing_score: 0.75,
    page_count: 5,
    question_count: 8,
    availability: "available",
    enabled: true,
    xp_threshold: null,
  },
  {
    id: "rust-failed",
    title: "Rust Retry Track",
    description: "Focused drills for memory-safe systems programming.",
    version: "1.0.0",
    tags: ["rust", "systems"],
    passing_score: 0.75,
    page_count: 4,
    question_count: 6,
    availability: "available",
    enabled: true,
    xp_threshold: null,
  },
  {
    id: "go-incomplete",
    title: "Go Starter Kit",
    description: "Learn goroutines and concurrency fundamentals.",
    version: "1.0.0",
    tags: ["golang", "concurrency"],
    passing_score: 0.75,
    page_count: 3,
    question_count: 5,
    availability: "available",
    enabled: true,
    xp_threshold: null,
  },
  {
    id: "support-unavailable",
    title: "Support Unavailable Pack",
    description: "Temporarily unavailable for learners.",
    version: "1.0.0",
    tags: ["support"],
    passing_score: 0.75,
    page_count: 2,
    question_count: 2,
    availability: "unavailable",
    enabled: false,
    xp_threshold: null,
  },
  {
    id: "retired-hidden",
    title: "Retired Hidden Pack",
    description: "Should not be rendered in learner feed.",
    version: "1.0.0",
    tags: ["retired"],
    passing_score: 0.75,
    page_count: 2,
    question_count: 2,
    availability: "hidden",
    enabled: false,
    xp_threshold: null,
  },
];

const SEEDED_TEST_RESULTS = {
  "lle_test_results_python-completed": JSON.stringify({
    easy: {
      passed: true,
      bestScore: 100,
      bestXpEarned: 80,
      lastAttemptedAt: "2026-05-20",
    },
  }),
  "lle_test_results_rust-failed": JSON.stringify({
    easy: {
      passed: false,
      bestScore: 45,
      bestXpEarned: 15,
      lastAttemptedAt: "2026-05-21",
    },
    medium: {
      passed: false,
      bestScore: 40,
      bestXpEarned: 12,
      lastAttemptedAt: "2026-05-21",
    },
  }),
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
    await expect(
      card.getByRole("button", { name: "Start Learning" }),
    ).toBeVisible();
    await expect(card.getByRole("button", { name: "Take Test" })).toBeVisible();
  });

  test("card shows page and question counts", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("3 pages")).toBeVisible();
    await expect(page.getByText("4 questions")).toBeVisible();
  });

  test("unavailable packages are greyed and learner actions are disabled", async ({
    page,
  }) => {
    await page.unrouteAll({ behavior: "wait" });
    await page.route("**/packages", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([MOCK_UNAVAILABLE_PACKAGE]),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: /Unavailable/i }).click();

    const card = getPackageCard(page, MOCK_UNAVAILABLE_PACKAGE.title);
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/package-card--unavailable/);
    await expect(card.locator(".package-card__status")).toHaveText(
      "Unavailable",
    );
    await expect(card.locator(".package-stats-strip")).toHaveCount(0);

    await expect(
      card.getByRole("button", { name: "Start Learning" }),
    ).toBeDisabled();
    await expect(
      card.getByRole("button", { name: "Take Test" }),
    ).toBeDisabled();
  });

  test("clicking a card navigates to the package detail URL", async ({
    page,
  }) => {
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

  test("shows empty state when backend returns empty array", async ({
    page,
  }) => {
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
    await expect(
      page.getByRole("heading", { name: "Test Complete" }),
    ).toBeVisible();

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
    await expect(easyCircle).toHaveClass(
      /difficulty-circle--(passed|attempted)/,
    );

    const statsStrip = refreshedCard.locator(".package-stats-strip");
    await expect(statsStrip).toBeVisible();
    await expect(statsStrip).toContainText(/easy/i);
    await expect(statsStrip).toContainText(/\d+%/);
  });

  test("difficulty circles expose descriptive aria-label text", async ({
    page,
  }) => {
    await page.goto("/");

    const card = getPackageCard(page, packageTitle);
    const notAttemptedCircle = card
      .locator('.difficulty-circle[aria-label*="Not attempted"]')
      .first();

    await expect(notAttemptedCircle).toBeVisible();
    await expect(notAttemptedCircle).toHaveAttribute(
      "aria-label",
      /Not attempted/,
    );
  });

  test("anonymous users see streak from localStorage", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("lle_daily_streak", "3");
      localStorage.setItem("lle_last_active", "2026-05-24");
    });

    await page.goto("/");

    await expect(page.getByText("🔥 3 days streak")).toBeVisible();
    await expect(page.getByLabel("3 day streak")).toBeVisible();
  });

  test("authenticated users load streak from backend instead of localStorage", async ({
    page,
  }) => {
    const authUser = {
      id: 51,
      username: "streak-auth-user",
      email: "streak-auth-user@example.com",
      role: "student",
      xp: 0,
      created_at: "2026-05-23T00:00:00Z",
    };

    await page.addInitScript(() => {
      sessionStorage.setItem("lle_auth_token", "streak-auth-token");
      localStorage.setItem("lle_daily_streak", "1");
      localStorage.setItem("lle_last_active", "2026-05-24");
    });

    await page.route(`${API_BASE_URL}/users/me`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(authUser),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/streak`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          streak_count: 6,
          last_practised_date: "2026-05-24",
        }),
      });
    });

    await page.goto("/");

    await expect(page.getByText("🔥 6 days streak")).toBeVisible();
    await expect(page.getByText("🔥 1 day streak")).toHaveCount(0);
  });
});

test.describe("Package search and filter", () => {
  const AUTH_USER = {
    id: 101,
    username: "learner-progress",
    email: "learner-progress@example.com",
    role: "student",
    xp: 0,
    created_at: "2026-05-23T00:00:00Z",
  };

  const titles = {
    completed: SEARCH_FILTER_PACKAGES[0].title,
    failed: SEARCH_FILTER_PACKAGES[1].title,
    incomplete: SEARCH_FILTER_PACKAGES[2].title,
    unavailable: SEARCH_FILTER_PACKAGES[3].title,
    hidden: SEARCH_FILTER_PACKAGES[4].title,
  };

  const getPackageCard = (page: Page, title: string) =>
    page.locator("article.package-card").filter({
      has: page.getByRole("heading", { name: new RegExp(title, "i") }),
    });

  const assertVisibleTitles = async (page: Page, expectedTitles: string[]) => {
    const cards = page.locator("article.package-card");
    await expect(cards).toHaveCount(expectedTitles.length);
    for (const title of expectedTitles) {
      await expect(getPackageCard(page, title)).toBeVisible();
    }
  };

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((seed) => {
      localStorage.clear();
      for (const [key, value] of Object.entries(seed)) {
        localStorage.setItem(key, value);
      }
    }, SEEDED_TEST_RESULTS);

    await page.route("**/packages", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SEARCH_FILTER_PACKAGES),
      });
    });
  });

  test("renders a usable search input", async ({ page }) => {
    await page.goto("/");
    const input = page.getByRole("searchbox", { name: "Search packages" });
    await expect(input).toBeVisible();
    await input.fill("python");
    await expect(input).toHaveValue("python");
  });

  test("searches packages by title", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("searchbox", { name: "Search packages" }).fill("Rust");
    await assertVisibleTitles(page, [titles.failed]);
  });

  test("searches packages by description", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("searchbox", { name: "Search packages" })
      .fill("goroutines");
    await assertVisibleTitles(page, [titles.incomplete]);
  });

  test("searches packages by tag", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("searchbox", { name: "Search packages" })
      .fill("python");
    await assertVisibleTitles(page, [titles.completed]);
  });

  test("clear button clears query and restores package list", async ({
    page,
  }) => {
    await page.goto("/");
    const input = page.getByRole("searchbox", { name: "Search packages" });
    await input.fill("rust");
    await expect(
      page.getByRole("button", { name: "Clear search" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(input).toHaveValue("");
    await assertVisibleTitles(page, [
      titles.completed,
      titles.failed,
      titles.incomplete,
    ]);
  });

  test("updates the q query parameter while typing", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("searchbox", { name: "Search packages" })
      .fill("python");
    await expect(page).toHaveURL(/\?q=python/);
  });

  test("prefills and filters when loading with q query parameter", async ({
    page,
  }) => {
    await page.goto("/?q=rust");
    await expect(
      page.getByRole("searchbox", { name: "Search packages" }),
    ).toHaveValue("rust");
    await assertVisibleTitles(page, [titles.failed]);
  });

  test("renders filter pills with counts", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /All\s*3/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Incomplete\s*1/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Failed\s*1/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Completed\s*1/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Unavailable\s*1/i }),
    ).toBeVisible();
  });

  test("completed filter shows only completed packages", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Completed/i }).click();
    await assertVisibleTitles(page, [titles.completed]);
  });

  test("failed filter shows only failed packages", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Failed/i }).click();
    await assertVisibleTitles(page, [titles.failed]);
  });

  test("incomplete filter shows only unattempted packages", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Incomplete/i }).click();
    await assertVisibleTitles(page, [titles.incomplete]);
  });

  test("unavailable filter shows only unavailable packages", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Unavailable/i }).click();
    await assertVisibleTitles(page, [titles.unavailable]);
  });

  test("hidden packages are absent from learner feed", async ({ page }) => {
    await page.goto("/");
    await expect(getPackageCard(page, titles.hidden)).toHaveCount(0);
    await assertVisibleTitles(page, [
      titles.completed,
      titles.failed,
      titles.incomplete,
    ]);
  });

  test("persists active filter in URL", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Failed/i }).click();
    await expect(page).toHaveURL(/\?filter=failed/);
  });

  test("applies filter when loading page with filter query parameter", async ({
    page,
  }) => {
    await page.goto("/?filter=completed");
    await assertVisibleTitles(page, [titles.completed]);
    await expect(
      page.getByRole("button", { name: /Completed/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("supports combined search and filter with matching and empty states", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("searchbox", { name: "Search packages" })
      .fill("python");
    await page.getByRole("button", { name: /Completed/i }).click();
    await assertVisibleTitles(page, [titles.completed]);

    await page.getByRole("button", { name: /Failed/i }).click();
    await expect(page.locator("article.package-card")).toHaveCount(0);
    await expect(page.getByText("No packages match 'python'")).toBeVisible();
  });

  test("shows filtered count text when results are narrowed", async ({
    page,
  }) => {
    await page.goto("/");
    const filteredCount = page.locator(".package-list-page__count");

    await page.getByRole("button", { name: /Failed/i }).click();
    await expect(filteredCount).toHaveText("Showing 1 of 3 packages");

    await page.getByRole("button", { name: /All/i }).click();
    await expect(filteredCount).toHaveCount(0);
  });

  test("anonymous users keep localStorage-derived package status", async ({
    page,
  }) => {
    await page.route(`${API_BASE_URL}/users/me/progress**`, (route) => {
      route.fulfill({ status: 500, body: "Should not be called" });
    });

    await page.goto("/");
    await page.getByRole("button", { name: /Completed/i }).click();
    await assertVisibleTitles(page, [titles.completed]);
  });

  test("authenticated users persist and reload package status from backend progress", async ({
    page,
  }) => {
    const authPackage = {
      id: "auth-progress-pkg",
      title: "Auth Progress Package",
      description: "Server-backed status package",
      version: "1.0.0",
      tags: ["auth"],
      passing_score: 0.75,
      page_count: 1,
      question_count: 1,
      availability: "available",
      enabled: true,
      xp_threshold: null,
    };

    let progressRows: Array<{
      package_id: string;
      latest_weighted_score: number;
      completed: boolean;
      attempt_count: number;
      first_completed_at: string | null;
      updated_at: string;
    }> = [];
    let streakCount = 2;

    const oneQuestionPackage = {
      id: authPackage.id,
      title: authPackage.title,
      description: authPackage.description,
      version: authPackage.version,
      tags: authPackage.tags,
      passing_score: authPackage.passing_score,
      pages: [{ id: "p-1", title: "Intro", content: "Start here" }],
      questions: [
        {
          id: "q-1",
          text: "Which answer is correct?",
          answers: [
            { id: "a-1", text: "Correct Option" },
            { id: "a-2", text: "Wrong Option" },
          ],
          correct_answer: "a-1",
          weight: 1,
          feedback: "Correct Option is right.",
          revision_page_ids: [],
        },
      ],
    };

    await page.route(`${API_BASE_URL}/auth/login`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "token-progress-bridge",
          token_type: "bearer",
          user: AUTH_USER,
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/progress`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(progressRows),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/streak`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          streak_count: streakCount,
          last_practised_date: "2026-05-23",
        }),
      });
    });

    await page.route(
      `${API_BASE_URL}/users/me/streak/mark-practised`,
      (route) => {
        streakCount += 1;
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            streak_count: streakCount,
            last_practised_date: "2026-05-24",
          }),
        });
      },
    );

    await page.route("**/packages", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([authPackage]),
      });
    });

    await page.route(
      `${API_BASE_URL}/users/me/progress/${authPackage.id}`,
      async (route) => {
        const payload = route.request().postDataJSON() as {
          latest_weighted_score: number;
        };

        const updated = {
          package_id: authPackage.id,
          latest_weighted_score: payload.latest_weighted_score,
          completed: true,
          attempt_count: 1,
          first_completed_at: "2026-05-23T12:00:00Z",
          updated_at: "2026-05-23T12:00:00Z",
        };

        progressRows = [updated];

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(updated),
        });
      },
    );

    await page.route(`${API_BASE_URL}/packages/${authPackage.id}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(oneQuestionPackage),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Username or email").fill("learner-progress");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("button", { name: /Incomplete\s*1/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Incomplete/i }).click();
    await assertVisibleTitles(page, [authPackage.title]);

    const card = getPackageCard(page, authPackage.title);
    await card.getByRole("button", { name: "Take Test" }).click();
    await page.getByRole("button", { name: /Easy/i }).click();
    await page.getByRole("button", { name: "Correct Option" }).click();
    await page.getByRole("button", { name: "Finish" }).click();
    await page
      .locator(".test-results__actions")
      .getByRole("button", { name: "Back to packages", exact: true })
      .click();

    await expect(
      page.getByRole("button", { name: /Completed\s*1/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Completed/i }).click();
    await assertVisibleTitles(page, [authPackage.title]);
  });
});
