import { type Page, expect, test } from "@playwright/test";

const API_BASE_URL = "http://localhost:8000";
const SAMPLE_PACKAGE_ID = "sample-auth-pkg";

const MOCK_PACKAGES = [
  {
    id: SAMPLE_PACKAGE_ID,
    title: "Sample Package",
    description: "Used for optional auth tests.",
    version: "1.0.0",
    tags: ["demo"],
    passing_score: 0.8,
    page_count: 1,
    question_count: 1,
    availability: "available",
    enabled: true,
    xp_threshold: null,
  },
];

async function seedAnonymousMergeState(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate((packageId) => {
    localStorage.setItem("lle_xp", "125");
    localStorage.setItem(
      `lle_attempt_${packageId}`,
      JSON.stringify({ count: 3, date: "2026-05-23" }),
    );
    localStorage.setItem(`lle_completed_${packageId}`, "1");
    localStorage.setItem(
      `lle_test_results_${packageId}`,
      JSON.stringify({
        normal: {
          passed: true,
          bestScore: 60,
          bestXpEarned: 18,
          lastAttemptedAt: "2026-05-24T08:00:00Z",
        },
      }),
    );
    localStorage.setItem("lle_daily_streak", "5");
    localStorage.setItem("lle_last_active", "2026-05-24");
  }, SAMPLE_PACKAGE_ID);
}

test.describe("Optional auth shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${API_BASE_URL}/packages`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PACKAGES),
      });
    });
  });

  test("home shows sign in and create account links", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create account" }),
    ).toBeVisible();
    await expect(page.getByText("Sample Package")).toBeVisible();
  });

  test("register page submits and returns to home", async ({ page }) => {
    let registerBody: {
      username: string;
      email: string;
      password: string;
      selected_package_ids?: string[];
    } | null = null;

    await page.route(`${API_BASE_URL}/auth/register`, (route) => {
      registerBody = route.request().postDataJSON() as {
        username: string;
        email: string;
        password: string;
        selected_package_ids?: string[];
      };

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "token-123",
          token_type: "bearer",
          user: {
            id: 1,
            username: "newuser",
            email: "newuser@example.com",
            role: "student",
            xp: 0,
            created_at: "2026-05-23T00:00:00Z",
          },
        }),
      });
    });

    await page.goto("/register");
    await page.getByLabel("Username").fill("newuser");
    await page.getByLabel("Email").fill("newuser@example.com");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByLabel("Sample Package").check();
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("Sample Package")).toBeVisible();
    expect(registerBody?.selected_package_ids).toEqual([SAMPLE_PACKAGE_ID]);
  });

  test("login page shows API error on invalid credentials", async ({
    page,
  }) => {
    await page.route(`${API_BASE_URL}/auth/login`, (route) => {
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid username/email or password" }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Username or email").fill("learner1");
    await page.getByLabel("Password").fill("WrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toContainText("Login failed (401)");
  });

  test("successful login updates shared auth state above routes", async ({
    page,
  }) => {
    const authUser = {
      id: 2,
      username: "learner1",
      email: "learner1@example.com",
      role: "student",
      xp: 10,
      created_at: "2026-05-23T00:00:00Z",
    };

    await page.route(`${API_BASE_URL}/auth/login`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "token-shared-state",
          token_type: "bearer",
          user: authUser,
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(authUser),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Username or email").fill("learner1");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.locator("[data-auth-status='authenticated']"),
    ).toBeVisible();

    await page.goto("/register");
    await expect(
      page.locator("[data-auth-status='authenticated']"),
    ).toBeVisible();
  });

  test("register accepts anonymous import and merges XP, progress, and streak", async ({
    page,
  }) => {
    const registeredUser = {
      id: 7,
      username: "merge-user",
      email: "merge-user@example.com",
      role: "student",
      xp: 10,
      created_at: "2026-05-23T00:00:00Z",
    };
    let promptSeen = false;
    let updatedXP: number | null = null;
    let mergedProgress: {
      attempt_count: number;
      completed: boolean;
      latest_weighted_score: number;
    } | null = null;
    let mergedStreak: {
      streak_count: number;
      last_practised_date: string | null;
    } | null = null;
    let promptMessage = "";

    page.on("dialog", async (dialog) => {
      promptSeen = true;
      promptMessage = dialog.message();
      await dialog.accept();
    });

    await page.route(`${API_BASE_URL}/auth/register`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "token-register-merge",
          token_type: "bearer",
          user: registeredUser,
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(registeredUser),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/xp`, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ xp: 80 }),
        });
        return;
      }

      const body = route.request().postDataJSON() as { xp: number };
      updatedXP = body.xp;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xp: body.xp }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/progress`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            user_id: registeredUser.id,
            package_id: SAMPLE_PACKAGE_ID,
            attempt_count: 1,
            completed: false,
            latest_weighted_score: 0.4,
            first_completed_at: null,
            updated_at: "2026-05-23T00:00:00Z",
          },
        ]),
      });
    });

    await page.route(
      `${API_BASE_URL}/users/me/progress/${SAMPLE_PACKAGE_ID}`,
      (route) => {
        const body = route.request().postDataJSON() as {
          attempt_count?: number;
          completed: boolean;
          latest_weighted_score: number;
        };

        mergedProgress = {
          attempt_count: body.attempt_count ?? 0,
          completed: body.completed,
          latest_weighted_score: body.latest_weighted_score,
        };

        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            user_id: registeredUser.id,
            package_id: SAMPLE_PACKAGE_ID,
            attempt_count: body.attempt_count ?? 0,
            completed: body.completed,
            latest_weighted_score: body.latest_weighted_score,
            first_completed_at: "2026-05-24T08:00:00Z",
            updated_at: "2026-05-24T08:00:00Z",
          }),
        });
      },
    );

    await page.route(`${API_BASE_URL}/users/me/streak`, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            streak_count: 0,
            last_practised_date: null,
          }),
        });
        return;
      }

      mergedStreak = route.request().postDataJSON() as {
        streak_count: number;
        last_practised_date: string | null;
      };

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mergedStreak),
      });
    });

    await seedAnonymousMergeState(page);

    await page.goto("/register");
    await page.getByLabel("Username").fill("merge-user");
    await page.getByLabel("Email").fill("merge-user@example.com");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByLabel("Sample Package").check();
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL("/");
    await expect.poll(() => promptSeen).toBeTruthy();
    await expect
      .poll(() => promptMessage.includes("local anonymous data"))
      .toBeTruthy();
    await expect
      .poll(() => promptMessage.includes("XP, saved progress, and streak"))
      .toBeTruthy();
    await expect
      .poll(() => promptMessage.includes("will not be overwritten"))
      .toBeTruthy();
    await expect.poll(() => updatedXP).toBe(125);
    await expect.poll(() => mergedProgress?.attempt_count ?? 0).toBe(3);
    await expect.poll(() => mergedProgress?.completed ?? false).toBeTruthy();
    await expect
      .poll(() => mergedProgress?.latest_weighted_score ?? 0)
      .toBe(0.6);
    await expect.poll(() => mergedStreak?.streak_count ?? 0).toBe(5);
    await expect
      .poll(() => mergedStreak?.last_practised_date ?? null)
      .toBe("2026-05-24");

    const storage = await page.evaluate(() => ({
      xp: localStorage.getItem("lle_xp"),
      attempt: localStorage.getItem("lle_attempt_sample-auth-pkg"),
      completed: localStorage.getItem("lle_completed_sample-auth-pkg"),
      results: localStorage.getItem("lle_test_results_sample-auth-pkg"),
      streak: localStorage.getItem("lle_daily_streak"),
      lastActive: localStorage.getItem("lle_last_active"),
      decision: localStorage.getItem("lle_xp_reconciled_user_7"),
    }));
    expect(storage.xp).toBeNull();
    expect(storage.attempt).toBeNull();
    expect(storage.completed).toBeNull();
    expect(storage.results).toBeNull();
    expect(storage.streak).toBeNull();
    expect(storage.lastActive).toBeNull();
    expect(storage.decision).toBe("1");
  });

  test("logout clears anonymous keys and returns to the anonymous auth boundary", async ({
    page,
  }) => {
    const authUser = {
      id: 31,
      username: "logout-user",
      email: "logout-user@example.com",
      role: "student",
      xp: 25,
      created_at: "2026-05-23T00:00:00Z",
    };

    await page.route(`${API_BASE_URL}/auth/login`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "token-logout-user",
          token_type: "bearer",
          user: authUser,
        }),
      });
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
        body: JSON.stringify([]),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/streak`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          streak_count: 2,
          last_practised_date: "2026-05-24",
        }),
      });
    });

    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("lle_xp", "40");
      localStorage.setItem("lle_daily_streak", "3");
      localStorage.setItem("lle_last_active", "2026-05-24");
      localStorage.setItem("lle_attempt_sample-auth-pkg", '{"count":2}');
      localStorage.setItem("lle_completed_sample-auth-pkg", "1");
      localStorage.setItem(
        "lle_test_results_sample-auth-pkg",
        JSON.stringify({
          normal: {
            passed: true,
            bestScore: 80,
            bestXpEarned: 12,
            lastAttemptedAt: "2026-05-24T09:00:00Z",
          },
        }),
      );
    });

    await page.goto("/login");
    await page.getByLabel("Username or email").fill("logout-user");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("Signed in as logout-user")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page.locator("[data-auth-status='idle']")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create account" }),
    ).toBeVisible();

    const storage = await page.evaluate(() => ({
      xp: localStorage.getItem("lle_xp"),
      streak: localStorage.getItem("lle_daily_streak"),
      lastActive: localStorage.getItem("lle_last_active"),
      attempt: localStorage.getItem("lle_attempt_sample-auth-pkg"),
      completed: localStorage.getItem("lle_completed_sample-auth-pkg"),
      results: localStorage.getItem("lle_test_results_sample-auth-pkg"),
    }));

    expect(storage.xp).toBeNull();
    expect(storage.streak).toBeNull();
    expect(storage.lastActive).toBeNull();
    expect(storage.attempt).toBeNull();
    expect(storage.completed).toBeNull();
    expect(storage.results).toBeNull();
  });

  test("switching accounts remounts the auth boundary without stale user state", async ({
    page,
  }) => {
    const alice = {
      id: 41,
      username: "alice",
      email: "alice@example.com",
      role: "student",
      xp: 60,
      created_at: "2026-05-23T00:00:00Z",
    };
    const bob = {
      id: 42,
      username: "bob",
      email: "bob@example.com",
      role: "student",
      xp: 12,
      created_at: "2026-05-23T00:00:00Z",
    };
    let currentUser = alice;

    await page.route(`${API_BASE_URL}/auth/login`, async (route) => {
      const body = route.request().postDataJSON() as {
        username_or_email: string;
      };
      currentUser = body.username_or_email === "alice" ? alice : bob;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: `token-${currentUser.username}`,
          token_type: "bearer",
          user: currentUser,
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentUser),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/progress`, (route) => {
      const progressRows =
        currentUser.id === alice.id
          ? [
              {
                user_id: alice.id,
                package_id: SAMPLE_PACKAGE_ID,
                attempt_count: 2,
                completed: true,
                latest_weighted_score: 0.9,
                first_completed_at: "2026-05-24T08:30:00Z",
                updated_at: "2026-05-24T08:30:00Z",
              },
            ]
          : [];

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(progressRows),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/library`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PACKAGES),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/streak`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          streak_count: currentUser.id === alice.id ? 6 : 1,
          last_practised_date:
            currentUser.id === alice.id ? "2026-05-24" : "2026-05-23",
        }),
      });
    });

    await page.goto("/");
    await page.goto("/login");

    await page.getByLabel("Username or email").fill("alice");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("Signed in as alice")).toBeVisible();
    await expect(page.getByText("Last test: Normal — 90%")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.locator("[data-auth-status='idle']")).toBeVisible();

    await page.goto("/login");
    await page.getByLabel("Username or email").fill("bob");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("Signed in as bob")).toBeVisible();
    await expect(page.getByText("Signed in as alice")).toHaveCount(0);
    await expect(page.getByText("Last test: Normal — 90%")).toHaveCount(0);
    await expect(page.getByLabel("Normal: Not attempted")).toBeVisible();
  });
});
