import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const MOCK_PACKAGE_ID = "python-basics";
const API_BASE_URL = "http://localhost:8000";

const DEFAULT_SETTINGS = {
  version: 1,
  xp: {
    lesson_base_xp_per_correct: 10,
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
      normal: 1.0,
      hard: 1.5,
      expert: 2.0,
    },
  },
};

const MOCK_SUMMARY = {
  id: MOCK_PACKAGE_ID,
  title: "Python Basics",
  description: "Learn Python fundamentals.",
  version: "1.0.0",
  tags: ["python"],
  passing_score: 0.75,
  page_count: 2,
  question_count: 2,
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
      weight: 1.0,
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
      weight: 1.0,
      feedback: "Variables store data values.",
      revision_page_ids: [],
    },
  ],
};

async function checkA11y(page: import("@playwright/test").Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
}

test.describe("Lesson Mode", () => {
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

    await page.route(`${API_BASE_URL}/api/settings`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(DEFAULT_SETTINGS),
      });
    });
  });

  test("navigating to a package loads the lesson page", async ({ page }) => {
    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await expect(page.getByRole("heading", { name: "Python Basics" })).toBeVisible();
  });

  test("first study page content is visible", async ({ page }) => {
    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await expect(page.getByText("Introduction")).toBeVisible();
  });

  test("progress bar shows page 1 of 2", async ({ page }) => {
    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await expect(page.getByText("Page 1 of 2")).toBeVisible();
  });

  test("clicking Next Page advances to second page", async ({ page }) => {
    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Next Page/i }).click();
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Variables" })).toBeVisible();
  });

  test("clicking Start Questions on last page enters question phase", async ({
    page,
  }) => {
    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Next Page/i }).click();
    await page.getByRole("button", { name: /Start Questions/i }).click();
    await expect(page.getByText("Question 1 of 2")).toBeVisible();
  });

  test("answering a question correctly shows correct feedback", async ({ page }) => {
    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Next Page/i }).click();
    await page.getByRole("button", { name: /Start Questions/i }).click();
    await page.getByRole("button", { name: "A programming language" }).click();
    await expect(page.getByText("Correct!")).toBeVisible();
    await expect(
      page.getByText("Python is indeed a programming language."),
    ).toBeVisible();
  });

  test("answering a question incorrectly shows incorrect feedback", async ({
    page,
  }) => {
    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Next Page/i }).click();
    await page.getByRole("button", { name: /Start Questions/i }).click();
    await page.getByRole("button", { name: "A snake" }).click();
    await expect(page.getByText("Incorrect", { exact: true })).toBeVisible();
  });

  test("completing all questions shows the completion screen", async ({ page }) => {
    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Skip to Questions/i }).click();
    await page.getByRole("button", { name: "A programming language" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Store data" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
    await expect(page.getByText("2 / 2 correct")).toBeVisible();
  });

  test("404 package shows error state", async ({ page }) => {
    await page.unrouteAll({ behavior: "wait" });
    await page.route(`${API_BASE_URL}/packages/nonexistent`, (route) => {
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Package not found" }),
      });
    });

    await page.goto("/packages/nonexistent");
    await checkA11y(page);
    await expect(page.getByText(/not found|Failed to load/i)).toBeVisible();
  });

  test("back link navigates to home", async ({ page }) => {
    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("link", { name: /Back to packages/i }).click();
    await expect(page).toHaveURL("/");
  });

  test("first-completion bonus badge shows +20 XP on CompletionScreen", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("lle_completed_python-basics");
      localStorage.removeItem("lle_attempt_python-basics");
    });

    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Skip to Questions/i }).click();
    await page.getByRole("button", { name: "A programming language" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Store data" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("+20 XP bonus")).toBeVisible();
  });

  test("second attempt shows Reduced XP badge on CompletionScreen", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(
        "lle_attempt_python-basics",
        JSON.stringify({ count: 1, date: today }),
      );
      localStorage.setItem("lle_completed_python-basics", "1");
    });

    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Skip to Questions/i }).click();
    await page.getByRole("button", { name: "A programming language" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Store data" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("Reduced XP (×0.5)")).toBeVisible();
  });

  test("fourth attempt shows 0 XP practice mode on CompletionScreen", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(
        "lle_attempt_python-basics",
        JSON.stringify({ count: 3, date: today }),
      );
      localStorage.setItem("lle_completed_python-basics", "1");
    });

    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Skip to Questions/i }).click();
    await page.getByRole("button", { name: "A programming language" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Store data" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("0 XP (Practice Mode)")).toBeVisible();
    await expect(
      page.getByText("Practice makes perfect! Full XP returns tomorrow."),
    ).toBeVisible();
  });

  test("settings endpoint changes first-completion bonus badge text", async ({
    page,
  }) => {
    await page.route(`${API_BASE_URL}/api/settings`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...DEFAULT_SETTINGS,
          xp: {
            ...DEFAULT_SETTINGS.xp,
            first_completion_bonus: 35,
          },
        }),
      });
    });

    await page.addInitScript(() => {
      localStorage.removeItem("lle_completed_python-basics");
      localStorage.removeItem("lle_attempt_python-basics");
    });

    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Skip to Questions/i }).click();
    await page.getByRole("button", { name: "A programming language" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Store data" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("+35 XP bonus")).toBeVisible();
  });

  test("authenticated lesson mode uses server metadata and skips localStorage metadata keys", async ({
    page,
  }) => {
    const authUser = {
      id: 78,
      username: "lesson-meta-user",
      email: "lesson-meta-user@example.com",
      role: "student",
      xp: 110,
      created_at: "2026-05-23T00:00:00Z",
    };
    const progressRow = {
      package_id: MOCK_PACKAGE_ID,
      latest_weighted_score: 0.4,
      completed: true,
      attempt_count: 1,
      first_completed_at: "2026-05-23T08:30:00Z",
      updated_at: "2026-05-23T08:30:00Z",
    };

    let capturedAttemptCount: number | null = null;

    await page.addInitScript(() => {
      sessionStorage.setItem("lle_auth_token", "lesson-meta-auth-token");
      localStorage.removeItem("lle_attempt_python-basics");
      localStorage.removeItem("lle_completed_python-basics");
      localStorage.removeItem("lle_daily_streak");
      localStorage.removeItem("lle_last_active");
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
            updated_at: "2026-05-24T11:00:00Z",
          }),
        });
      },
    );

    await page.route(`${API_BASE_URL}/users/me/xp`, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ xp: authUser.xp }),
        });
        return;
      }

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xp: 120 }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/streak`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          streak_count: 4,
          last_practised_date: "2026-05-23",
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/streak/mark-practised`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          streak_count: 5,
          last_practised_date: "2026-05-24",
        }),
      });
    });

    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Skip to Questions/i }).click();
    await page.getByRole("button", { name: "A programming language" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Store data" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    await expect.poll(() => capturedAttemptCount).toBe(2);
    await expect(page.getByText("Reduced XP (×0.5)")).toBeVisible();
    await expect(page.getByText("+20 XP bonus")).toHaveCount(0);

    const localMetadata = await page.evaluate(() => ({
      attempt: localStorage.getItem("lle_attempt_python-basics"),
      firstCompletion: localStorage.getItem("lle_completed_python-basics"),
    }));
    expect(localMetadata.attempt).toBeNull();
    expect(localMetadata.firstCompletion).toBeNull();
  });

  test("authenticated lesson completion marks streak via backend endpoint", async ({
    page,
  }) => {
    const authUser = {
      id: 77,
      username: "lesson-auth-user",
      email: "lesson-auth-user@example.com",
      role: "student",
      xp: 120,
      created_at: "2026-05-23T00:00:00Z",
    };
    let streakMarkCalls = 0;

    await page.addInitScript(() => {
      sessionStorage.setItem("lle_auth_token", "lesson-auth-token");
      localStorage.removeItem("lle_daily_streak");
      localStorage.removeItem("lle_last_active");
    });

    await page.route(`${API_BASE_URL}/users/me`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(authUser),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/xp`, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ xp: authUser.xp }),
        });
        return;
      }

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xp: 140 }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/streak`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          streak_count: 5,
          last_practised_date: "2026-05-23",
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/streak/mark-practised`, (route) => {
      streakMarkCalls += 1;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          streak_count: 6,
          last_practised_date: "2026-05-24",
        }),
      });
    });

    await page.goto(`/packages/${MOCK_PACKAGE_ID}`);
    await checkA11y(page);
    await page.getByRole("button", { name: /Skip to Questions/i }).click();
    await page.getByRole("button", { name: "A programming language" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Store data" }).click();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
    await expect.poll(() => streakMarkCalls).toBe(1);
  });
});
