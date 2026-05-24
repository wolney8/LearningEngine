import { type Page, expect, test } from "@playwright/test";

const API_BASE_URL = "http://localhost:8000";
const PACKAGE_ID = "xp-pkg";

const SETTINGS = {
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

const PACKAGE_SUMMARY = {
  id: PACKAGE_ID,
  title: "XP Package",
  description: "Focused package for XP persistence checks.",
  version: "1.0.0",
  tags: ["xp"],
  passing_score: 0.75,
  page_count: 1,
  question_count: 1,
  availability: "available",
  enabled: true,
  xp_threshold: null,
};

const PACKAGE_DETAIL = {
  id: PACKAGE_ID,
  title: "XP Package",
  description: "Focused package for XP persistence checks.",
  version: "1.0.0",
  tags: ["xp"],
  passing_score: 0.75,
  pages: [
    {
      id: "page-1",
      title: "XP Intro",
      content: "One page is enough for this persistence flow.",
    },
  ],
  questions: [
    {
      id: "q1",
      text: "Select the correct answer",
      answers: [
        { id: "a1", text: "Correct" },
        { id: "a2", text: "Wrong" },
      ],
      correct_answer: "a1",
      weight: 1.0,
      feedback: "Correct answer selected.",
      revision_page_ids: [],
    },
  ],
};

async function registerPackageRoutes(page: Page): Promise<void> {
  await page.route(`${API_BASE_URL}/packages`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([PACKAGE_SUMMARY]),
    });
  });

  await page.route(`${API_BASE_URL}/packages/${PACKAGE_ID}`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(PACKAGE_DETAIL),
    });
  });

  await page.route(`${API_BASE_URL}/api/settings`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SETTINGS),
    });
  });
}

async function completeLessonRun(page: Page): Promise<void> {
  await page.goto(`/packages/${PACKAGE_ID}`);
  await page.getByRole("button", { name: /Start Questions/i }).click();
  await page.getByRole("button", { name: "Correct" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete!" })).toBeVisible();
}

test.describe("XP persistence", () => {
  test("authenticated users persist XP on the server across reload/session", async ({
    page,
  }) => {
    let serverXP = 10;
    let serverProgress = {
      user_id: 5,
      package_id: PACKAGE_ID,
      attempt_count: 0,
      completed: false,
      latest_weighted_score: 0,
      first_completed_at: null as string | null,
      updated_at: "2026-05-23T00:00:00Z",
    };
    const savedXPValues: number[] = [];

    await registerPackageRoutes(page);

    await page.route(`${API_BASE_URL}/auth/login`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "xp-auth-token",
          token_type: "bearer",
          user: {
            id: 5,
            username: "xp-user",
            email: "xp-user@example.com",
            role: "student",
            xp: serverXP,
            created_at: "2026-05-23T00:00:00Z",
          },
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 5,
          username: "xp-user",
          email: "xp-user@example.com",
          role: "student",
          xp: serverXP,
          created_at: "2026-05-23T00:00:00Z",
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/xp`, async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ xp: serverXP }),
        });
        return;
      }

      const payload = request.postDataJSON() as { xp: number };
      savedXPValues.push(payload.xp);
      serverXP = payload.xp;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xp: serverXP }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/progress`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(serverProgress.attempt_count > 0 ? [serverProgress] : []),
      });
    });

    await page.route(
      `${API_BASE_URL}/users/me/progress/${PACKAGE_ID}`,
      async (route) => {
        const payload = route.request().postDataJSON() as {
          attempt_count: number;
          completed: boolean;
          latest_weighted_score: number;
        };

        serverProgress = {
          ...serverProgress,
          attempt_count: payload.attempt_count,
          completed: payload.completed,
          latest_weighted_score: payload.latest_weighted_score,
          first_completed_at:
            payload.completed && serverProgress.first_completed_at == null
              ? "2026-05-23T00:05:00Z"
              : serverProgress.first_completed_at,
          updated_at: "2026-05-23T00:05:00Z",
        };

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(serverProgress),
        });
      },
    );

    await page.goto("/login");
    await page.getByLabel("Username or email").fill("xp-user");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    await completeLessonRun(page);
    await expect.poll(() => savedXPValues.length).toBe(1);
    expect(savedXPValues[0]).toBe(40);

    await page.reload();
    await page.goto("/login");
    await page.getByLabel("Username or email").fill("xp-user");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    await completeLessonRun(page);
    await expect.poll(() => savedXPValues.length).toBe(2);
    expect(savedXPValues[1]).toBe(45);

    const localXP = await page.evaluate(() => localStorage.getItem("lle_xp"));
    expect(localXP).toBeNull();
  });

  test("anonymous users keep XP localStorage-based", async ({ page }) => {
    let serverXPCalls = 0;

    await registerPackageRoutes(page);

    await page.route(`${API_BASE_URL}/users/me/xp**`, (route) => {
      serverXPCalls += 1;
      route.abort();
    });

    await completeLessonRun(page);

    const localXPAfterRun = await page.evaluate(() => localStorage.getItem("lle_xp"));
    expect(localXPAfterRun).toBe("30");
    expect(serverXPCalls).toBe(0);

    await page.reload();

    const localXPAfterReload = await page.evaluate(() =>
      localStorage.getItem("lle_xp"),
    );
    expect(localXPAfterReload).toBe("30");
    expect(serverXPCalls).toBe(0);
  });

  test("login keep-account decision skips server XP write and clears anonymous XP key", async ({
    page,
  }) => {
    let putCalls = 0;
    let promptCount = 0;

    page.on("dialog", async (dialog) => {
      promptCount += 1;
      await dialog.dismiss();
    });

    await registerPackageRoutes(page);

    await page.route(`${API_BASE_URL}/auth/login`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "xp-keep-token",
          token_type: "bearer",
          user: {
            id: 9,
            username: "keep-user",
            email: "keep-user@example.com",
            role: "student",
            xp: 200,
            created_at: "2026-05-23T00:00:00Z",
          },
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 9,
          username: "keep-user",
          email: "keep-user@example.com",
          role: "student",
          xp: 200,
          created_at: "2026-05-23T00:00:00Z",
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/xp`, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ xp: 200 }),
        });
        return;
      }

      putCalls += 1;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xp: 200 }),
      });
    });

    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("lle_xp", "500"));

    await page.goto("/login");
    await page.getByLabel("Username or email").fill("keep-user");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect.poll(() => promptCount).toBe(1);
    expect(putCalls).toBe(0);

    const storage = await page.evaluate(() => ({
      xp: localStorage.getItem("lle_xp"),
      decision: localStorage.getItem("lle_xp_reconciled_user_9"),
    }));
    expect(storage.xp).toBeNull();
    expect(storage.decision).toBe("1");
  });

  test("reconciliation prompt is one-time per user on the same device", async ({
    page,
  }) => {
    let promptCount = 0;
    let putCalls = 0;

    page.on("dialog", async (dialog) => {
      promptCount += 1;
      await dialog.accept();
    });

    await registerPackageRoutes(page);

    await page.route(`${API_BASE_URL}/auth/login`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "xp-once-token",
          token_type: "bearer",
          user: {
            id: 12,
            username: "once-user",
            email: "once-user@example.com",
            role: "student",
            xp: 40,
            created_at: "2026-05-23T00:00:00Z",
          },
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 12,
          username: "once-user",
          email: "once-user@example.com",
          role: "student",
          xp: 40,
          created_at: "2026-05-23T00:00:00Z",
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/xp`, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ xp: 40 }),
        });
        return;
      }

      putCalls += 1;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xp: 40 }),
      });
    });

    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("lle_xp", "100"));

    await page.goto("/login");
    await page.getByLabel("Username or email").fill("once-user");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
    await expect.poll(() => promptCount).toBe(1);

    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("lle_xp", "300"));
    await page.goto("/login");
    await page.getByLabel("Username or email").fill("once-user");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");

    expect(promptCount).toBe(1);
    expect(putCalls).toBe(1);
  });
});
