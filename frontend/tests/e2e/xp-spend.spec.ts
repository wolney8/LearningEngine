import AxeBuilder from "@axe-core/playwright";
import { type Page, expect, test } from "@playwright/test";

const API_BASE_URL = "http://localhost:8000";
const AUTH_TOKEN = "xp-spend-auth-token";
const PACKAGE_ID = "xp-spend-package";
const HIDDEN_PACKAGE_ID = "hidden-security-track";

const AUTH_USER = {
  id: 301,
  username: "xp-spender",
  email: "xp-spender@example.com",
  role: "student",
  xp: 500,
  created_at: "2026-06-01T00:00:00Z",
} as const;

const BASE_SETTINGS = {
  version: 1,
  xp: {
    lesson_base_xp_per_correct: 10,
    base_xp_per_level: 500,
    first_completion_bonus: 20,
    attempt_multipliers: {
      "1": 1.0,
      "2": 0.5,
      "3": 0.25,
    },
    hard_expert_exit_penalty: 50,
    hard_expert_low_answer_penalty: 50,
    min_correct_for_xp: {
      easy: 2,
      normal: 2,
      hard: 0,
      expert: 0,
    },
  },
  difficulty: {
    seconds_per_question: {
      easy: 90,
      normal: 45,
      hard: 20,
      expert: 10,
    },
    xp_multiplier: {
      easy: 0.5,
      normal: 1,
      hard: 1.5,
      expert: 2,
    },
  },
  content_refresh: {
    stale_after_days: 90,
  },
  ai: {
    provider: "gemini",
    model: "gemini-2.0-flash-exp",
  },
  spend_economy: {
    enabled: false,
    allow_non_admin_ai_generation_spend: false,
    costs: {
      generate_ai_course: 500,
      refresh_stale_course: 300,
      increase_difficulty_cap: 200,
      unlock_hidden_package: 250,
    },
  },
  celebration_effects: {
    enabled: false,
    confetti_on_pass: true,
    confetti_on_bonus_xp_gain: true,
    lightning_on_streak_milestones: true,
    respect_reduced_motion: true,
  },
};

const TEST_PACKAGE_SUMMARY = {
  id: PACKAGE_ID,
  title: "XP Spend Practice",
  description: "Package for XP spending e2e coverage.",
  version: "1.0.0",
  tags: ["xp"],
  passing_score: 0.75,
  page_count: 1,
  question_count: 2,
  availability: "available",
  enabled: true,
  xp_threshold: null,
  selected: true,
} as const;

const HIDDEN_PACKAGE_SUMMARY = {
  id: HIDDEN_PACKAGE_ID,
  title: "Hidden Security Track",
  description: "Hidden package unlock flow.",
  version: "1.0.0",
  tags: ["security"],
  passing_score: 0.75,
  page_count: 2,
  question_count: 2,
  availability: "hidden",
  enabled: false,
  xp_threshold: null,
  selected: false,
} as const;

const TEST_PACKAGE_DETAIL = {
  id: PACKAGE_ID,
  title: "XP Spend Practice",
  description: "Package for XP spending e2e coverage.",
  version: "1.0.0",
  tags: ["xp"],
  passing_score: 0.75,
  pages: [
    {
      id: "p1",
      title: "Intro",
      content: "Study this before taking the test.",
    },
  ],
  questions: [
    {
      id: "q1",
      text: "Question one?",
      answers: [
        { id: "a1", text: "Correct" },
        { id: "a2", text: "Wrong" },
      ],
      correct_answer: "a1",
      weight: 0.5,
      feedback: "Great.",
      revision_page_ids: [],
    },
    {
      id: "q2",
      text: "Question two?",
      answers: [
        { id: "b1", text: "Correct" },
        { id: "b2", text: "Wrong" },
      ],
      correct_answer: "b1",
      weight: 0.5,
      feedback: "Great.",
      revision_page_ids: [],
    },
  ],
} as const;

function buildSettings(spendEconomyEnabled: boolean) {
  return {
    ...BASE_SETTINGS,
    spend_economy: {
      ...BASE_SETTINGS.spend_economy,
      enabled: spendEconomyEnabled,
    },
  };
}

async function checkA11y(page: import("@playwright/test").Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
}

async function seedAuthenticatedSession(page: Page): Promise<void> {
  await page.addInitScript((token) => {
    localStorage.clear();
    sessionStorage.clear();
    sessionStorage.setItem("lle_auth_token", token);
  }, AUTH_TOKEN);
}

async function registerAuthenticatedCoreRoutes(
  page: Page,
  options: {
    spendEconomyEnabled: boolean;
    xp: number;
  },
): Promise<void> {
  let xpValue = options.xp;

  await page.route(`${API_BASE_URL}/api/settings`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildSettings(options.spendEconomyEnabled)),
    });
  });

  await page.route(`${API_BASE_URL}/users/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...AUTH_USER, xp: xpValue }),
    });
  });

  await page.route(`${API_BASE_URL}/users/me/xp`, (route) => {
    const request = route.request();

    if (request.method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xp: xpValue }),
      });
      return;
    }

    if (request.method() === "PUT") {
      const payload = request.postDataJSON() as { xp: number };
      xpValue = payload.xp;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xp: xpValue }),
      });
      return;
    }

    route.fulfill({ status: 405 });
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
}

async function registerTestModeRoutes(
  page: Page,
  options: {
    spendEconomyEnabled: boolean;
    xp: number;
    unlockedDifficulties: { hard: boolean; expert: boolean };
  },
): Promise<void> {
  await registerAuthenticatedCoreRoutes(page, {
    spendEconomyEnabled: options.spendEconomyEnabled,
    xp: options.xp,
  });

  await page.route(`${API_BASE_URL}/packages/${PACKAGE_ID}`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(TEST_PACKAGE_DETAIL),
    });
  });

  await page.route(
    `${API_BASE_URL}/users/me/unlocked-difficulties/${PACKAGE_ID}`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(options.unlockedDifficulties),
      });
    },
  );
}

async function registerPackageListRoutes(
  page: Page,
  options: {
    spendEconomyEnabled: boolean;
    xp: number;
    cataloguePackages: unknown[];
  },
): Promise<void> {
  await registerAuthenticatedCoreRoutes(page, {
    spendEconomyEnabled: options.spendEconomyEnabled,
    xp: options.xp,
  });

  await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([TEST_PACKAGE_SUMMARY]),
    });
  });

  await page.route(`${API_BASE_URL}/users/me/catalogue`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(options.cataloguePackages),
    });
  });
}

test.describe("XP spend economy", () => {
  test("Scenario 1: economy disabled hides spend UI", async ({ page }) => {
    await seedAuthenticatedSession(page);

    await registerTestModeRoutes(page, {
      spendEconomyEnabled: false,
      xp: 500,
      unlockedDifficulties: { hard: false, expert: false },
    });

    await registerPackageListRoutes(page, {
      spendEconomyEnabled: false,
      xp: 500,
      cataloguePackages: [TEST_PACKAGE_SUMMARY, HIDDEN_PACKAGE_SUMMARY],
    });

    await page.goto(`/test/exam/${PACKAGE_ID}`);
    await checkA11y(page);

    const hardButton = page.getByRole("button", { name: /Hard/i });
    const expertButton = page.getByRole("button", { name: /Expert/i });

    await expect(hardButton).toBeVisible();
    await expect(expertButton).toBeVisible();
    await expect(hardButton).not.toContainText("XP to unlock");
    await expect(expertButton).not.toContainText("XP to unlock");
    await expect(page.getByText("🔒", { exact: false })).toHaveCount(0);

    await page.goto("/");
    await page.getByRole("button", { name: "Full catalogue" }).click();
    await expect(page.getByRole("button", { name: "Unlock Package" })).toHaveCount(0);
  });

  test("Scenario 2: economy enabled shows difficulty lock UI", async ({ page }) => {
    await seedAuthenticatedSession(page);

    await registerTestModeRoutes(page, {
      spendEconomyEnabled: true,
      xp: 500,
      unlockedDifficulties: { hard: false, expert: false },
    });

    await page.goto(`/test/exam/${PACKAGE_ID}`);
    await checkA11y(page);

    const hardButton = page.getByRole("button", { name: /Hard/i });
    const expertButton = page.getByRole("button", { name: /Expert/i });

    await expect(hardButton).toContainText("200 XP to unlock");
    await expect(expertButton).toContainText("200 XP to unlock");
  });

  test("Scenario 3: insufficient XP disables modal confirm", async ({ page }) => {
    await seedAuthenticatedSession(page);

    await registerTestModeRoutes(page, {
      spendEconomyEnabled: true,
      xp: 0,
      unlockedDifficulties: { hard: false, expert: false },
    });

    await page.goto(`/test/exam/${PACKAGE_ID}`);
    await checkA11y(page);

    await page.getByRole("button", { name: /Hard/i }).click();

    const modal = page.getByTestId("spend-confirm-modal");
    const confirmButton = modal.getByRole("button", { name: "Confirm" });

    await expect(modal).toBeVisible();
    await expect(confirmButton).toBeDisabled();
    await expect(confirmButton).toHaveAttribute("aria-disabled", "true");
    await expect(modal.getByText("Insufficient XP")).toBeVisible();
  });

  test("Scenario 4: successful difficulty unlock proceeds to hard warning", async ({
    page,
  }) => {
    let spendRequestCount = 0;
    let spendRequestPayload: {
      action: string;
      package_id: string;
      difficulty?: string;
    } | null = null;

    await seedAuthenticatedSession(page);

    await registerTestModeRoutes(page, {
      spendEconomyEnabled: true,
      xp: 500,
      unlockedDifficulties: { hard: false, expert: false },
    });

    await page.route(`${API_BASE_URL}/users/me/xp/spend`, (route) => {
      spendRequestCount += 1;
      spendRequestPayload = route.request().postDataJSON() as {
        action: string;
        package_id: string;
        difficulty?: string;
      };

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          xp_remaining: 300,
          action: "difficulty_unlock",
          package_id: PACKAGE_ID,
          difficulty: "hard",
          cost: 200,
          success: true,
        }),
      });
    });

    await page.goto(`/test/exam/${PACKAGE_ID}`);
    await checkA11y(page);

    await page.getByRole("button", { name: /Hard/i }).click();

    const modal = page.getByTestId("spend-confirm-modal");
    await expect(modal).toBeVisible();

    await modal.getByRole("button", { name: "Confirm" }).click();

    await expect(modal).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Hard Mode/i })).toBeVisible();

    expect(spendRequestCount).toBe(1);
    expect(spendRequestPayload).toEqual({
      action: "difficulty_unlock",
      package_id: PACKAGE_ID,
      difficulty: "hard",
    });
  });

  test("Scenario 5: successful package unlock closes modal", async ({ page }) => {
    let spendRequestCount = 0;

    await seedAuthenticatedSession(page);

    await registerPackageListRoutes(page, {
      spendEconomyEnabled: true,
      xp: 500,
      cataloguePackages: [TEST_PACKAGE_SUMMARY, HIDDEN_PACKAGE_SUMMARY],
    });

    await page.route(`${API_BASE_URL}/users/me/xp/spend`, (route) => {
      spendRequestCount += 1;

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          xp_remaining: 250,
          action: "package_unlock",
          package_id: HIDDEN_PACKAGE_ID,
          difficulty: null,
          cost: 250,
          success: true,
        }),
      });
    });

    await page.goto("/");
    await checkA11y(page);

    await page.getByRole("button", { name: "Full catalogue" }).click();

    const hiddenPackageCard = page
      .locator("article.package-card")
      .filter({ hasText: HIDDEN_PACKAGE_SUMMARY.title });

    const unlockButton = hiddenPackageCard.getByRole("button", {
      name: "Unlock Package",
    });

    await expect(unlockButton).toBeVisible();
    await unlockButton.click();

    const modal = page.getByTestId("spend-confirm-modal");
    await expect(modal).toBeVisible();

    await modal.getByRole("button", { name: "Confirm" }).click();

    await expect(modal).toHaveCount(0);
    expect(spendRequestCount).toBe(1);
  });

  test("Scenario 6: cancelling spend does not call spend endpoint", async ({
    page,
  }) => {
    let spendRequestCount = 0;

    await seedAuthenticatedSession(page);

    await registerTestModeRoutes(page, {
      spendEconomyEnabled: true,
      xp: 500,
      unlockedDifficulties: { hard: false, expert: false },
    });

    await page.route(`${API_BASE_URL}/users/me/xp/spend`, (route) => {
      spendRequestCount += 1;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          xp_remaining: 300,
          action: "difficulty_unlock",
          package_id: PACKAGE_ID,
          difficulty: "hard",
          cost: 200,
          success: true,
        }),
      });
    });

    await page.goto(`/test/exam/${PACKAGE_ID}`);
    await checkA11y(page);

    await page.getByRole("button", { name: /Hard/i }).click();

    const modal = page.getByTestId("spend-confirm-modal");
    await expect(modal).toBeVisible();

    await modal.getByRole("button", { name: "Cancel" }).click();

    await expect(modal).toHaveCount(0);
    expect(spendRequestCount).toBe(0);
  });
});
