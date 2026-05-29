import AxeBuilder from "@axe-core/playwright";
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

const MOCK_LONG_TEXT_PACKAGE = {
  id: "long-text-package",
  title:
    "Foundations of Secure Systems Engineering for Distributed Teams and Enterprise Governance",
  description:
    "This intentionally long package description validates clamping behaviour across cards with complex narrative content, multiple clauses, and enough text volume to exceed three rendered lines in compact card widths.",
  version: "1.0.0",
  tags: ["tag-one", "tag-two", "tag-three", "tag-four", "tag-five"],
  passing_score: 0.75,
  page_count: 7,
  question_count: 9,
  availability: "available",
  enabled: true,
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

async function checkA11y(page: import("@playwright/test").Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
}

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
    await checkA11y(page);
    await expect(
      page.getByTestId("app-top-bar").getByRole("link", { name: "Go to home" }),
    ).toBeVisible();
  });

  test("renders a package card for each mocked package", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    const card = getPackageCard(page, packageTitle);
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Start Learning" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Take Test" })).toBeVisible();
  });

  test("card shows page and question counts", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    await expect(page.getByText("3 pages")).toBeVisible();
    await expect(page.getByText("4 questions")).toBeVisible();
  });

  test("applies title and description truncation structure for long card text", async ({
    page,
  }) => {
    await page.unrouteAll({ behavior: "wait" });
    await page.route("**/packages", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([MOCK_LONG_TEXT_PACKAGE]),
      });
    });

    await page.goto("/");
    await checkA11y(page);

    const card = getPackageCard(page, MOCK_LONG_TEXT_PACKAGE.title);
    const title = card.locator(".package-card__title");
    const description = card.locator(".package-card__description");

    await expect(card).toBeVisible();
    await expect(title).toBeVisible();
    await expect(description).toBeVisible();

    const titleClamp = await title.evaluate((node) =>
      getComputedStyle(node).getPropertyValue("-webkit-line-clamp").trim(),
    );
    const descriptionClamp = await description.evaluate((node) =>
      getComputedStyle(node).getPropertyValue("-webkit-line-clamp").trim(),
    );
    const titleOverflow = await title.evaluate(
      (node) => getComputedStyle(node).overflow,
    );
    const descriptionOverflow = await description.evaluate(
      (node) => getComputedStyle(node).overflow,
    );

    expect(titleClamp).toBe("2");
    expect(descriptionClamp).toBe("3");
    expect(titleOverflow).toBe("hidden");
    expect(descriptionOverflow).toBe("hidden");
  });

  test("shows compact tag overflow control and toggles full tag list", async ({
    page,
  }) => {
    await page.unrouteAll({ behavior: "wait" });
    await page.route("**/packages", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([MOCK_LONG_TEXT_PACKAGE]),
      });
    });

    await page.goto("/");
    await checkA11y(page);

    const card = getPackageCard(page, MOCK_LONG_TEXT_PACKAGE.title);
    const tags = card.locator(".package-card__tag");
    const overflowButton = card.locator(".package-card__tags-toggle");

    await expect(card).toBeVisible();
    await expect(tags).toHaveCount(3);
    await expect(card.getByText("tag-four", { exact: true })).toHaveCount(0);
    await expect(overflowButton).toHaveText("+2 more");
    await expect(overflowButton).toHaveAttribute("aria-expanded", "false");

    await overflowButton.click();
    await expect(tags).toHaveCount(5);
    await expect(card.getByText("tag-four", { exact: true })).toBeVisible();
    await expect(overflowButton).toHaveText("Show less");
    await expect(overflowButton).toHaveAttribute("aria-expanded", "true");

    await overflowButton.click();
    await expect(tags).toHaveCount(3);
    await expect(overflowButton).toHaveText("+2 more");
    await expect(overflowButton).toHaveAttribute("aria-expanded", "false");
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
    await checkA11y(page);
    await page.getByRole("button", { name: /Unavailable/i }).click();

    const card = getPackageCard(page, MOCK_UNAVAILABLE_PACKAGE.title);
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/package-card--unavailable/);
    await expect(card.locator(".package-card__status")).toHaveText("Unavailable");
    await expect(card.locator(".package-stats-strip")).toHaveCount(0);

    await expect(card.getByRole("button", { name: "Start Learning" })).toBeDisabled();
    await expect(card.getByRole("button", { name: "Take Test" })).toBeDisabled();
  });

  test("clicking a card navigates to the package detail URL", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
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
    await checkA11y(page);
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
    await checkA11y(page);
    await expect(page.getByText("No packages available.")).toBeVisible();
  });

  test("shows labelled not-attempted difficulty indicators on each package card by default", async ({
    page,
  }) => {
    await page.goto("/");
    await checkA11y(page);

    const card = getPackageCard(page, packageTitle);
    const circles = card.locator(".difficulty-circle");
    const title = card.locator(".package-card__title");
    const headerIndicators = card.locator(
      ".package-card__header > .package-progress-panel",
    );

    await expect(
      card.getByText("Previously completed difficulties", { exact: true }),
    ).toBeHidden();
    await expect(
      card.getByText("Shows your best previous test outcome for each difficulty.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(card.getByText("v1.0.0", { exact: true })).toHaveCount(0);
    await expect(title).toBeVisible();
    await expect(headerIndicators).toBeVisible();

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
    await checkA11y(page);
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

  test("difficulty indicators expose difficulty and status in aria-label text", async ({
    page,
  }) => {
    await page.goto("/");
    await checkA11y(page);

    const card = getPackageCard(page, packageTitle);
    const easyIndicator = card.locator('.difficulty-circle[data-difficulty="easy"]');

    await expect(easyIndicator).toBeVisible();
    await expect(easyIndicator).toHaveAttribute("aria-label", /Easy: Not attempted/);
    await expect(easyIndicator).toHaveAttribute(
      "title",
      "Easy difficulty: not attempted yet.",
    );
  });

  test("anonymous users see streak from localStorage", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("lle_daily_streak", "3");
      localStorage.setItem("lle_last_active", "2026-05-24");
    });

    await page.goto("/");
    await checkA11y(page);

    await expect(page.getByText("Current streak")).toBeVisible();
    await expect(page.getByText("3 days streak")).toBeVisible();
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

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PACKAGES),
      });
    });

    await page.goto("/");
    await checkA11y(page);

    await expect(page.getByText("Current streak")).toBeVisible();
    await expect(page.getByText("6 days streak")).toBeVisible();
    await expect(page.getByText("1 day streak")).toHaveCount(0);
  });

  test("authenticated users default to My Library and can switch to Full catalogue", async ({
    page,
  }) => {
    const authUser = {
      id: 77,
      username: "library-user",
      email: "library-user@example.com",
      role: "student",
      xp: 0,
      created_at: "2026-05-23T00:00:00Z",
    };

    await page.addInitScript(() => {
      sessionStorage.setItem("lle_auth_token", "library-token");
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
          streak_count: 0,
          last_practised_date: null,
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/progress`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([MOCK_PACKAGES[0]]),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/catalogue`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([MOCK_PACKAGES[0], MOCK_UNAVAILABLE_PACKAGE]),
      });
    });

    await page.goto("/");
    await checkA11y(page);

    await expect(page.getByRole("button", { name: "My Library" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(getPackageCard(page, MOCK_PACKAGES[0].title)).toBeVisible();

    await page.getByRole("button", { name: "Full catalogue" }).click();
    await expect(page.getByRole("button", { name: "Full catalogue" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const availableCard = getPackageCard(page, MOCK_PACKAGES[0].title);
    const unavailableCard = getPackageCard(page, MOCK_UNAVAILABLE_PACKAGE.title);
    await expect(availableCard).toBeVisible();
    await expect(unavailableCard).toBeVisible();
    await expect(
      availableCard.getByRole("button", { name: "Start Learning" }),
    ).toHaveCount(0);
    await expect(availableCard.getByRole("button", { name: "Take Test" })).toHaveCount(
      0,
    );
    await expect(availableCard.locator(".package-progress-panel")).toHaveCount(0);
  });

  test("anonymous users keep global catalogue behaviour without scope toggle", async ({
    page,
  }) => {
    await page.goto("/");
    await checkA11y(page);
    await expect(page.getByRole("button", { name: "My Library" })).toHaveCount(0);
    await expect(getPackageCard(page, MOCK_PACKAGES[0].title)).toBeVisible();
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
    await checkA11y(page);
    const input = page.getByRole("searchbox", { name: "Search packages" });
    await expect(input).toBeVisible();
    await input.fill("python");
    await expect(input).toHaveValue("python");
  });

  test("searches packages by title", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("searchbox", { name: "Search packages" }).fill("Rust");
    await assertVisibleTitles(page, [titles.failed]);
  });

  test("searches packages by description", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("searchbox", { name: "Search packages" }).fill("goroutines");
    await assertVisibleTitles(page, [titles.incomplete]);
  });

  test("searches packages by tag", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("searchbox", { name: "Search packages" }).fill("python");
    await assertVisibleTitles(page, [titles.completed]);
  });

  test("clear button clears query and restores package list", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    const input = page.getByRole("searchbox", { name: "Search packages" });
    await input.fill("rust");
    await expect(page.getByRole("button", { name: "Clear search" })).toBeVisible();
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
    await checkA11y(page);
    await page.getByRole("searchbox", { name: "Search packages" }).fill("python");
    await expect(page).toHaveURL(/\?q=python/);
  });

  test("prefills and filters when loading with q query parameter", async ({ page }) => {
    await page.goto("/?q=rust");
    await checkA11y(page);
    await expect(page.getByRole("searchbox", { name: "Search packages" })).toHaveValue(
      "rust",
    );
    await assertVisibleTitles(page, [titles.failed]);
  });

  test("renders filter pills with counts", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    await expect(page.getByRole("button", { name: /All\s*3/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Incomplete\s*1/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Failed\s*1/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Completed\s*1/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Unavailable\s*1/i })).toBeVisible();
  });

  test("completed filter shows only completed packages", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("button", { name: /Completed/i }).click();
    await assertVisibleTitles(page, [titles.completed]);
  });

  test("failed filter shows only failed packages", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("button", { name: /Failed/i }).click();
    await assertVisibleTitles(page, [titles.failed]);
  });

  test("incomplete filter shows only unattempted packages", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("button", { name: /Incomplete/i }).click();
    await assertVisibleTitles(page, [titles.incomplete]);
  });

  test("unavailable filter shows only unavailable packages", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("button", { name: /Unavailable/i }).click();
    await assertVisibleTitles(page, [titles.unavailable]);
  });

  test("hidden packages are absent from learner feed", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    await expect(getPackageCard(page, titles.hidden)).toHaveCount(0);
    await assertVisibleTitles(page, [
      titles.completed,
      titles.failed,
      titles.incomplete,
    ]);
  });

  test("persists active filter in URL", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("button", { name: /Failed/i }).click();
    await expect(page).toHaveURL(/\?filter=failed/);
  });

  test("applies filter when loading page with filter query parameter", async ({
    page,
  }) => {
    await page.goto("/?filter=completed");
    await checkA11y(page);
    await assertVisibleTitles(page, [titles.completed]);
    await expect(page.getByRole("button", { name: /Completed/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("supports combined search and filter with matching and empty states", async ({
    page,
  }) => {
    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("searchbox", { name: "Search packages" }).fill("python");
    await page.getByRole("button", { name: /Completed/i }).click();
    await assertVisibleTitles(page, [titles.completed]);

    await page.getByRole("button", { name: /Failed/i }).click();
    await expect(page.locator("article.package-card")).toHaveCount(0);
    await expect(page.getByText("No packages match 'python'")).toBeVisible();
  });

  test("shows filtered count text when results are narrowed", async ({ page }) => {
    await page.goto("/");
    await checkA11y(page);
    const filteredCount = page.locator(".package-list-page__count");

    await page.getByRole("button", { name: /Failed/i }).click();
    await expect(filteredCount).toHaveText("Showing 1 of 3 packages");

    await page.getByRole("button", { name: /All/i }).click();
    await expect(filteredCount).toHaveCount(0);
  });

  test("anonymous users keep localStorage-derived package status", async ({ page }) => {
    await page.route(`${API_BASE_URL}/users/me/progress**`, (route) => {
      route.fulfill({ status: 500, body: "Should not be called" });
    });

    await page.goto("/");
    await checkA11y(page);
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

    await page.route(`${API_BASE_URL}/users/me`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(AUTH_USER),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([authPackage]),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/catalogue`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([authPackage]),
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

    await page.route(`${API_BASE_URL}/users/me/streak/mark-practised`, (route) => {
      streakCount += 1;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          streak_count: streakCount,
          last_practised_date: "2026-05-24",
        }),
      });
    });

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
    await checkA11y(page);
    await page.getByLabel("Username or email").fill("learner-progress");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("button", { name: /Incomplete\s*1/i })).toBeVisible();
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

    await expect(page.getByRole("button", { name: /Completed\s*1/i })).toBeVisible();
    await page.getByRole("button", { name: /Completed/i }).click();
    await assertVisibleTitles(page, [authPackage.title]);
  });
});

// ---------------------------------------------------------------------------
// Library management: add / remove courses
// ---------------------------------------------------------------------------

const LM_AUTH_USER = {
  id: 200,
  username: "lib-mgmt-user",
  email: "lib-mgmt-user@example.com",
  role: "student",
  xp: 0,
  created_at: "2026-05-23T00:00:00Z",
};

const LM_PACKAGE_UNSELECTED = {
  id: "python-basics",
  title: "Python Basics",
  description: "Learn Python fundamentals.",
  version: "1.0.0",
  tags: ["python"],
  passing_score: 0.75,
  page_count: 3,
  question_count: 4,
  availability: "available",
  enabled: true,
  xp_threshold: null,
  selected: false,
};

const LM_PACKAGE_SELECTED = {
  ...LM_PACKAGE_UNSELECTED,
  selected: true,
};

const LM_PACKAGE_UNAVAILABLE_UNSELECTED = {
  id: "locked-course",
  title: "Locked Course",
  description: "Temporarily unavailable.",
  version: "1.0.0",
  tags: ["locked"],
  passing_score: 0.75,
  page_count: 1,
  question_count: 1,
  availability: "unavailable",
  enabled: false,
  xp_threshold: null,
  selected: false,
};

const LM_CATALOGUE_TAG_PACKAGES = [
  {
    id: "cloud-foundations",
    title: "Cloud Foundations",
    description: "Cloud platform basics.",
    version: "1.0.0",
    tags: ["cloud"],
    passing_score: 0.75,
    page_count: 2,
    question_count: 3,
    availability: "available",
    enabled: true,
    xp_threshold: null,
    selected: false,
  },
  {
    id: "network-essentials",
    title: "Network Essentials",
    description: "Networking fundamentals.",
    version: "1.0.0",
    tags: ["network"],
    passing_score: 0.75,
    page_count: 2,
    question_count: 3,
    availability: "available",
    enabled: true,
    xp_threshold: null,
    selected: false,
  },
  {
    id: "python-data",
    title: "Python Data",
    description: "Data workflows in Python.",
    version: "1.0.0",
    tags: ["python"],
    passing_score: 0.75,
    page_count: 3,
    question_count: 4,
    availability: "available",
    enabled: true,
    xp_threshold: null,
    selected: false,
  },
  {
    id: "security-core",
    title: "Security Core",
    description: "Practical cyber security basics.",
    version: "1.0.0",
    tags: ["security"],
    passing_score: 0.75,
    page_count: 3,
    question_count: 4,
    availability: "available",
    enabled: true,
    xp_threshold: null,
    selected: false,
  },
  {
    id: "sql-analytics",
    title: "SQL Analytics",
    description: "Query and report with SQL.",
    version: "1.0.0",
    tags: ["sql"],
    passing_score: 0.75,
    page_count: 3,
    question_count: 4,
    availability: "available",
    enabled: true,
    xp_threshold: null,
    selected: false,
  },
  {
    ...LM_PACKAGE_UNAVAILABLE_UNSELECTED,
    id: "ops-locked",
    title: "Ops Locked Track",
    tags: ["operations"],
  },
];

async function seedAuthSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    sessionStorage.setItem("lle_auth_token", "lib-mgmt-token");
  });

  await page.route(`${API_BASE_URL}/users/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(LM_AUTH_USER),
    });
  });

  await page.route(`${API_BASE_URL}/users/me/streak`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ streak_count: 0, last_practised_date: null }),
    });
  });

  await page.route(`${API_BASE_URL}/users/me/progress`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

test.describe("Library management — authenticated users", () => {
  const getCard = (page: Page, title: string) =>
    page.locator("article.package-card").filter({
      has: page.getByRole("heading", { name: new RegExp(title, "i") }),
    });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
    });
  });

  test("catalogue view shows Add to Library for unselected packages", async ({
    page,
  }) => {
    await seedAuthSession(page);

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/catalogue`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([LM_PACKAGE_UNSELECTED]),
      });
    });

    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("button", { name: "Full catalogue" }).click();

    const card = getCard(page, LM_PACKAGE_UNSELECTED.title);
    await expect(card.getByRole("button", { name: /Add to Library/i })).toBeVisible();
  });

  test("catalogue view shows Remove from Library for already-selected packages", async ({
    page,
  }) => {
    await seedAuthSession(page);

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([LM_PACKAGE_UNSELECTED]),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/catalogue`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([LM_PACKAGE_SELECTED]),
      });
    });

    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("button", { name: "Full catalogue" }).click();

    const card = getCard(page, LM_PACKAGE_SELECTED.title);
    await expect(
      card.getByRole("button", { name: /Remove from Library/i }),
    ).toBeVisible();
    await expect(card.getByRole("button", { name: /Add to Library/i })).toHaveCount(0);
  });

  test("clicking Add to Library calls PUT /users/me/library/:id and reloads", async ({
    page,
  }) => {
    let putCalled = false;
    let deleteCalled = false;
    let isSelectedInCatalogue = false;

    await seedAuthSession(page);

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
        return;
      }
      route.fallback();
    });

    await page.route(`${API_BASE_URL}/users/me/catalogue`, (route) => {
      const packageForState = isSelectedInCatalogue
        ? LM_PACKAGE_SELECTED
        : LM_PACKAGE_UNSELECTED;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([packageForState]),
      });
    });

    await page.route(
      `${API_BASE_URL}/users/me/library/${LM_PACKAGE_UNSELECTED.id}`,
      (route) => {
        if (route.request().method() === "PUT") {
          putCalled = true;
          isSelectedInCatalogue = true;
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(LM_PACKAGE_SELECTED),
          });
          return;
        }
        if (route.request().method() === "DELETE") {
          deleteCalled = true;
          isSelectedInCatalogue = false;
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(LM_PACKAGE_UNSELECTED),
          });
          return;
        }
        route.fallback();
      },
    );

    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("button", { name: "Full catalogue" }).click();

    const card = getCard(page, LM_PACKAGE_UNSELECTED.title);
    await card.getByRole("button", { name: /Add to Library/i }).click();

    await expect.poll(() => putCalled).toBe(true);
    await expect(
      card.getByRole("button", { name: /Remove from Library/i }),
    ).toBeVisible();

    await card.getByRole("button", { name: /Remove from Library/i }).click();
    await expect.poll(() => deleteCalled).toBe(true);
    await expect(card.getByRole("button", { name: /Add to Library/i })).toBeVisible();
  });

  test("library view shows top-right remove control for each course", async ({
    page,
  }) => {
    await seedAuthSession(page);

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([LM_PACKAGE_UNSELECTED]),
      });
    });

    await page.goto("/");
    await checkA11y(page);

    const card = getCard(page, LM_PACKAGE_UNSELECTED.title);
    await expect(
      card.getByRole("button", { name: /Remove from library/i }),
    ).toBeVisible();
  });

  test("clicking Remove calls DELETE /users/me/library/:id and reloads", async ({
    page,
  }) => {
    let deleteCalled = false;
    let removePromptSeen = false;

    page.on("dialog", async (dialog) => {
      removePromptSeen = true;
      await dialog.accept();
    });

    await seedAuthSession(page);

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([LM_PACKAGE_UNSELECTED]),
        });
        return;
      }
      route.fallback();
    });

    await page.route(
      `${API_BASE_URL}/users/me/library/${LM_PACKAGE_UNSELECTED.id}`,
      (route) => {
        if (route.request().method() === "DELETE") {
          deleteCalled = true;
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ...LM_PACKAGE_UNSELECTED, selected: false }),
          });
          return;
        }
        route.fallback();
      },
    );

    await page.goto("/");
    await checkA11y(page);

    const card = getCard(page, LM_PACKAGE_UNSELECTED.title);
    await card.getByRole("button", { name: /Remove from library/i }).click();

    await expect.poll(() => removePromptSeen).toBe(true);
    await expect.poll(() => deleteCalled).toBe(true);
    await expect(page.getByText(/Progress was reset/i)).toBeVisible();
  });

  test("library view does not show Add to Library buttons", async ({ page }) => {
    await seedAuthSession(page);

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([LM_PACKAGE_UNSELECTED]),
      });
    });

    await page.goto("/");
    await checkA11y(page);

    await expect(page.getByRole("button", { name: /Add to Library/i })).toHaveCount(0);
  });

  test("anonymous users see no Add to Library or Remove buttons", async ({ page }) => {
    await page.route(`${API_BASE_URL}/packages`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([LM_PACKAGE_UNSELECTED]),
      });
    });

    await page.goto("/");
    await checkA11y(page);

    await expect(page.getByRole("button", { name: /Add to Library/i })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Remove from library/i }),
    ).toHaveCount(0);
  });

  test("unavailable packages in catalogue show Add to Library without learner launch actions", async ({
    page,
  }) => {
    await seedAuthSession(page);

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/catalogue`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([LM_PACKAGE_UNAVAILABLE_UNSELECTED]),
      });
    });

    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("button", { name: "Full catalogue" }).click();
    await page.getByRole("button", { name: /Unavailable/i }).click();

    const card = getCard(page, LM_PACKAGE_UNAVAILABLE_UNSELECTED.title);
    await expect(card.getByRole("button", { name: /Add to Library/i })).toBeVisible();
    await expect(card.getByRole("button", { name: "Start Learning" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Take Test" })).toHaveCount(0);
    await expect(card.locator(".package-progress-panel")).toHaveCount(0);
  });

  test("full catalogue uses tag chips with overflow menu and supports clearing overflow selection", async ({
    page,
  }) => {
    await seedAuthSession(page);

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/catalogue`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(LM_CATALOGUE_TAG_PACKAGES),
      });
    });

    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("button", { name: "Full catalogue" }).click();

    await expect(
      page.getByRole("searchbox", { name: "Search packages" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Unavailable" })).toBeVisible();
    await expect(page.getByRole("button", { name: "..." })).toBeVisible();

    await page.getByRole("button", { name: "..." }).click();
    await expect(page.getByRole("menu", { name: "More package tags" })).toBeVisible();

    await page.getByRole("menuitemradio", { name: "sql" }).click();
    await expect(page).toHaveURL(/tag=sql/);

    const sqlCard = getCard(page, "SQL Analytics");
    await expect(sqlCard).toBeVisible();
    await expect(page.locator("article.package-card")).toHaveCount(1);

    await page.getByRole("button", { name: "x ..." }).click();
    await expect(page).not.toHaveURL(/tag=sql/);
    await expect(page.locator("article.package-card")).toHaveCount(
      LM_CATALOGUE_TAG_PACKAGES.length,
    );
  });

  test("full catalogue applies unavailable tag from URL parameter", async ({
    page,
  }) => {
    const unavailableCataloguePackage = LM_CATALOGUE_TAG_PACKAGES.find(
      (pkg) => pkg.availability === "unavailable",
    );
    if (!unavailableCataloguePackage) {
      throw new Error("Expected unavailable package in catalogue fixture");
    }

    await seedAuthSession(page);

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/catalogue`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(LM_CATALOGUE_TAG_PACKAGES),
      });
    });

    await page.goto("/?tag=unavailable");
    await checkA11y(page);
    await page.getByRole("button", { name: "Full catalogue" }).click();

    await expect(page.getByRole("button", { name: "Unavailable" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(getCard(page, unavailableCataloguePackage.title)).toBeVisible();
    await expect(page.locator("article.package-card")).toHaveCount(1);
  });

  test("unavailable packages in library hide Remove while Start Learning and Take Test remain disabled", async ({
    page,
  }) => {
    await seedAuthSession(page);

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([LM_PACKAGE_UNAVAILABLE_UNSELECTED]),
      });
    });

    await page.goto("/");
    await checkA11y(page);
    await page.getByRole("button", { name: /Unavailable/i }).click();

    const card = getCard(page, LM_PACKAGE_UNAVAILABLE_UNSELECTED.title);
    await expect(
      card.getByRole("button", { name: /Remove from library/i }),
    ).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Start Learning" })).toBeDisabled();
    await expect(card.getByRole("button", { name: "Take Test" })).toBeDisabled();
  });
});
