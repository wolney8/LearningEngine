import AxeBuilder from "@axe-core/playwright";
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

async function checkA11y(page: import("@playwright/test").Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
}

async function seedAnonymousMergeState(page: Page): Promise<void> {
  await page.goto("/");
  await checkA11y(page);
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
    await checkA11y(page);

    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
    await expect(page.getByText("Sample Package")).toBeVisible();
  });

  test("theme toggle persists explicit light or dark choice across reload", async ({
    page,
  }) => {
    await page.goto("/");

    const themeToggle = page.getByRole("button", {
      name: "Switch to dark theme",
    });
    await themeToggle.click();

    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.getAttribute("data-theme")),
      )
      .toBe("dark");

    await page.reload();

    await expect(
      page.getByRole("button", { name: "Switch to light theme" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.getAttribute("data-theme")),
      )
      .toBe("dark");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("lle_theme_mode")))
      .toBe("dark");
  });

  test("system default tracks emulated OS colour scheme with no stored choice", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.getAttribute("data-theme")),
      )
      .toBe("dark");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("lle_theme_mode")))
      .toBeNull();

    await page.emulateMedia({ colorScheme: "light" });

    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.getAttribute("data-theme")),
      )
      .toBe("light");
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
    await checkA11y(page);
    await page.getByLabel("Username").fill("newuser");
    await page.getByLabel("Email").fill("newuser@example.com");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByLabel("Sample Package").check();
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("Sample Package")).toBeVisible();
    expect(registerBody?.selected_package_ids).toEqual([SAMPLE_PACKAGE_ID]);
  });

  test("login page shows API error on invalid credentials", async ({ page }) => {
    await page.route(`${API_BASE_URL}/auth/login`, (route) => {
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Invalid username/email or password" }),
      });
    });

    await page.goto("/login");
    await checkA11y(page);
    await page.getByLabel("Username or email").fill("learner1");
    await page.getByLabel("Password").fill("WrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert")).toContainText("Login failed (401)");
  });

  test("successful login updates shared auth state above routes", async ({ page }) => {
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
    await checkA11y(page);
    await page.getByLabel("Username or email").fill("learner1");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.locator("[data-auth-status='authenticated']")).toBeVisible();

    await page.goto("/register");
    await checkA11y(page);
    await expect(page.locator("[data-auth-status='authenticated']")).toBeVisible();
  });

  test("login shows one-time Bonus XP notice when provided by auth response", async ({
    page,
  }) => {
    const authUser = {
      id: 3,
      username: "learner-bonus",
      email: "learner-bonus@example.com",
      role: "student",
      xp: 110,
      bonus_xp_notice: {
        xp: 30,
        reason: "Outstanding peer support",
      },
      created_at: "2026-05-23T00:00:00Z",
    };

    await page.route(`${API_BASE_URL}/auth/login`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "token-bonus-notice",
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
    await page.getByLabel("Username or email").fill("learner-bonus");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    const bonusNotice = page.locator(".app-top-bar__bonus-notice");
    await expect(bonusNotice).toBeVisible();
    await expect(bonusNotice).toContainText("Level boost unlocked");
    await expect(bonusNotice).toContainText(
      "+30 XP for Outstanding peer support. Keep the momentum!",
    );
    await expect(bonusNotice).not.toContainText("Reason:");

    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(bonusNotice).toHaveCount(0);
  });

  test("admin top bar links remain intact and sign-out restores guest CTAs", async ({
    page,
  }) => {
    const authUser = {
      id: 5,
      username: "admin-nav",
      email: "admin-nav@example.com",
      role: "admin",
      xp: 18,
      created_at: "2026-05-23T00:00:00Z",
    };

    await page.route(`${API_BASE_URL}/auth/login`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "token-admin-nav",
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
    await page.getByLabel("Username or email").fill("admin-nav");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    const topBar = page.getByTestId("app-top-bar");
    await expect(topBar.getByText("admin-nav")).toBeVisible();
    await expect(topBar.getByRole("link", { name: "Admin panel" })).toHaveAttribute(
      "href",
      "/admin/users",
    );
    await expect(topBar.getByRole("link", { name: "Learner view" })).toHaveAttribute(
      "href",
      "/",
    );
    await expect(topBar.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    await expect(
      topBar.getByRole("button", { name: "Sign out" }).first(),
    ).toBeVisible();

    await topBar.getByRole("button", { name: "Sign out" }).first().click();

    await expect(topBar.getByRole("link", { name: "Create account" })).toBeVisible();
    await expect(topBar.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(topBar.getByRole("link", { name: "Admin panel" })).toHaveCount(0);
    await expect(topBar.getByRole("link", { name: "Profile" })).toHaveCount(0);
  });

  test("mobile account menu closes on outside click and Escape", async ({ page }) => {
    const authUser = {
      id: 4,
      username: "admin-mobile",
      email: "admin-mobile@example.com",
      role: "admin",
      xp: 10,
      created_at: "2026-05-23T00:00:00Z",
    };

    await page.setViewportSize({ width: 390, height: 844 });

    await page.route(`${API_BASE_URL}/auth/login`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "token-mobile-menu",
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
    await page.getByLabel("Username or email").fill("admin-mobile");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    const accountButton = page.getByRole("button", { name: "Account" });
    await accountButton.click();
    const accountMenu = page.locator("#app-top-bar-mobile-menu");
    await expect(accountMenu.getByText("admin-mobile")).toBeVisible();
    await expect(accountMenu.getByRole("link", { name: "Learner view" })).toBeVisible();

    await page.mouse.click(8, 8);
    await expect(accountMenu).toHaveCount(0);

    await accountButton.click();
    await expect(accountMenu.getByRole("link", { name: "Profile" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(accountMenu).toHaveCount(0);
  });

  test("profile route redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/profile");

    await expect(page).toHaveURL("/login");
    await checkA11y(page);
  });

  test("profile page shows stats and allows username update", async ({ page }) => {
    let authUser = {
      id: 19,
      username: "profile-viewer",
      email: "profile-viewer@example.com",
      role: "student",
      xp: 88,
      created_at: "2026-05-23T00:00:00Z",
    };
    let receivedProfilePatchBody: { username?: string } | null = null;

    await page.addInitScript(() => {
      sessionStorage.setItem("lle_auth_token", "token-profile-viewer");
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
          streak_count: 4,
          last_practised_date: "2026-05-24",
        }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/xp`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ xp: 88 }),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/progress`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            package_id: SAMPLE_PACKAGE_ID,
            difficulty: "normal",
            latest_weighted_score: 0.8,
            completed: true,
            best_xp_earned: 18,
            attempt_count: 3,
            first_completed_at: "2026-05-23T08:30:00Z",
            updated_at: "2026-05-24T08:30:00Z",
          },
          {
            package_id: "second-profile-pkg",
            difficulty: "easy",
            latest_weighted_score: 0.65,
            completed: false,
            best_xp_earned: 8,
            attempt_count: 2,
            first_completed_at: null,
            updated_at: "2026-05-24T08:45:00Z",
          },
        ]),
      });
    });

    await page.route(`${API_BASE_URL}/users/me/profile`, (route) => {
      receivedProfilePatchBody = route.request().postDataJSON() as {
        username?: string;
      };
      authUser = {
        ...authUser,
        username: (receivedProfilePatchBody?.username ?? "").trim(),
      };

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(authUser),
      });
    });

    await page.goto("/profile");
    await checkA11y(page);

    const profileStats = page.getByLabel("Profile stats overview");
    await expect(page.getByRole("heading", { name: "Your Profile" })).toBeVisible();
    await expect(profileStats.getByText("Total XP").locator("..")).toContainText("88");
    await expect(profileStats.getByText("Current streak").locator("..")).toContainText(
      /\d+/,
    );
    await expect(
      profileStats.getByText("Completed packages").locator(".."),
    ).toContainText("1");
    await expect(page.getByRole("cell", { name: "80%" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "65%" })).toBeVisible();

    await page.getByLabel("Change username").fill("updated-profile-user");
    await page.getByRole("button", { name: "Save username" }).click();

    await expect(page.getByRole("status")).toContainText(
      "Username updated successfully.",
    );
    expect(receivedProfilePatchBody).toEqual({
      username: "updated-profile-user",
    });
    await expect(page.getByText("updated-profile-user")).toHaveCount(2);
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
            difficulty: "normal",
            attempt_count: 1,
            completed: false,
            latest_weighted_score: 0.4,
            best_xp_earned: 6,
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
          difficulty?: "easy" | "normal" | "hard" | "expert";
          attempt_count?: number;
          completed: boolean;
          latest_weighted_score: number;
          best_xp_earned?: number;
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
            difficulty: body.difficulty ?? "normal",
            attempt_count: body.attempt_count ?? 0,
            completed: body.completed,
            latest_weighted_score: body.latest_weighted_score,
            best_xp_earned: body.best_xp_earned ?? 18,
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
    await page.evaluate(() => {
      localStorage.removeItem("lle_xp_reconciled_user_7");
    });

    await page.goto("/register");
    await checkA11y(page);
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
    await expect.poll(() => mergedProgress !== null).toBeTruthy();
    await expect.poll(() => mergedProgress?.completed ?? false).toBeTruthy();
    await expect.poll(() => mergedProgress?.latest_weighted_score ?? 0).toBe(0.6);
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
    await checkA11y(page);
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
    await checkA11y(page);
    await page.getByLabel("Username or email").fill("logout-user");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByTestId("app-top-bar").getByText("logout-user"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page.locator("[data-auth-status='idle']")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();

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

  test("inactivity timeout logs out and redirects to login", async ({ page }) => {
    const authUser = {
      id: 32,
      username: "idle-user",
      email: "idle-user@example.com",
      role: "student",
      xp: 25,
      created_at: "2026-05-23T00:00:00Z",
    };

    await page.addInitScript(() => {
      (
        window as Window & {
          __LLE_INACTIVITY_TIMEOUT_MS__?: number;
        }
      ).__LLE_INACTIVITY_TIMEOUT_MS__ = 150;
    });

    await page.route(`${API_BASE_URL}/auth/login`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "token-idle-user",
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
    await checkA11y(page);
    await page.getByLabel("Username or email").fill("idle-user");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.locator("[data-auth-status='authenticated']")).toBeVisible();

    await expect(page).toHaveURL("/login", { timeout: 3_000 });
    await expect(page.locator("[data-auth-status='idle']")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
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
                difficulty: "normal",
                attempt_count: 2,
                completed: true,
                latest_weighted_score: 0.9,
                best_xp_earned: 20,
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
    await checkA11y(page);
    await page.goto("/login");
    await checkA11y(page);

    await page.getByLabel("Username or email").fill("alice");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("app-top-bar").getByText("alice")).toBeVisible();
    await expect(page.getByText("Last test: Normal — 90%")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.locator("[data-auth-status='idle']")).toBeVisible();

    await page.goto("/login");
    await checkA11y(page);
    await page.getByLabel("Username or email").fill("bob");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("app-top-bar").getByText("bob")).toBeVisible();
    await expect(page.getByText("alice")).toHaveCount(0);
    await expect(page.getByText("Last test: Normal — 90%")).toHaveCount(0);
    await expect(page.getByLabel("Normal: Not attempted")).toBeVisible();
  });
});
