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
});
