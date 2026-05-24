import { expect, test } from "@playwright/test";

const API_BASE_URL = "http://localhost:8000";

const MOCK_PACKAGES = [
  {
    id: "sample-auth-pkg",
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
    await expect(page.getByRole("link", { name: "Create account" })).toBeVisible();
    await expect(page.getByText("Sample Package")).toBeVisible();
  });

  test("register page submits and returns to home", async ({ page }) => {
    await page.route(`${API_BASE_URL}/auth/register`, (route) => {
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
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByText("Sample Package")).toBeVisible();
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
    await page.getByLabel("Username or email").fill("learner1");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.locator("[data-auth-status='authenticated']")).toBeVisible();

    await page.goto("/register");
    await expect(page.locator("[data-auth-status='authenticated']")).toBeVisible();
  });

  test("register prompts for anonymous XP import and clears local XP after decision", async ({
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

    page.on("dialog", async (dialog) => {
      promptSeen = true;
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

    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("lle_xp", "125"));

    await page.goto("/register");
    await page.getByLabel("Username").fill("merge-user");
    await page.getByLabel("Email").fill("merge-user@example.com");
    await page.getByLabel("Password").fill("StrongPass123");
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL("/");
    await expect.poll(() => promptSeen).toBeTruthy();
    await expect.poll(() => updatedXP).toBe(125);

    const storage = await page.evaluate(() => ({
      xp: localStorage.getItem("lle_xp"),
      decision: localStorage.getItem("lle_xp_reconciled_user_7"),
    }));
    expect(storage.xp).toBeNull();
    expect(storage.decision).toBe("1");
  });
});
