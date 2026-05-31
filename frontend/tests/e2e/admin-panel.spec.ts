import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const API_BASE_URL = "http://localhost:8000";
const AUTH_TOKEN = "admin-auth-token";
const ADMIN_USER = {
  id: 999,
  username: "admin-user",
  email: "admin@example.com",
  role: "admin",
  xp: 0,
  created_at: "2026-05-30T00:00:00Z",
} as const;

const SETTINGS_PAYLOAD = {
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
      normal: 1,
      hard: 1.5,
      expert: 2,
    },
  },
};

const PACKAGE_LIST = [
  {
    id: "sample-demo",
    title: "Sample Demo",
    description: "Demo package",
    version: "1.0.0",
    tags: ["demo"],
    passing_score: 0.75,
    page_count: 2,
    question_count: 4,
    availability: "available",
    enabled: true,
    xp_threshold: null,
  },
];

const AI_CONFIG_PAYLOAD = {
  provider: "gemini",
  model: "gemini-2.0-flash-exp",
  key_present: true,
} as const;

async function checkA11y(page: import("@playwright/test").Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
}

test.describe("Admin panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${API_BASE_URL}/users/me`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ADMIN_USER),
      });
    });

    await page.route(`${API_BASE_URL}/admin/settings`, (route) => {
      if (route.request().method() === "PUT") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: route.request().postData() ?? JSON.stringify(SETTINGS_PAYLOAD),
        });
        return;
      }

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(SETTINGS_PAYLOAD),
      });
    });

    await page.route(`${API_BASE_URL}/admin/packages`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PACKAGE_LIST),
      });
    });

    await page.route(`${API_BASE_URL}/admin/ai-config`, (route) => {
      if (route.request().method() === "PATCH") {
        const patch = route.request().postDataJSON() as {
          provider: "gemini";
          model: string;
        };
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            provider: patch.provider,
            model: patch.model,
            key_present: true,
          }),
        });
        return;
      }

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(AI_CONFIG_PAYLOAD),
      });
    });

    await page.route(`${API_BASE_URL}/admin/ai-config/test`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Connection test succeeded.",
        }),
      });
    });

    await page.route(`${API_BASE_URL}/admin/packages/*`, (route) => {
      const patch = route.request().postDataJSON() as {
        availability?: "available" | "unavailable" | "hidden";
        enabled?: boolean;
        xp_threshold?: number | null;
      };
      const availability =
        patch.availability ??
        (patch.enabled === undefined
          ? PACKAGE_LIST[0].availability
          : patch.enabled
            ? "available"
            : "unavailable");
      const next = {
        ...PACKAGE_LIST[0],
        availability,
        enabled: availability === "available",
        xp_threshold:
          patch.xp_threshold === undefined
            ? PACKAGE_LIST[0].xp_threshold
            : patch.xp_threshold,
      };

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(next),
      });
    });
  });

  test("admin guard prompts sign-in then allows admin session", async ({ page }) => {
    await page.goto("/admin");
    await checkA11y(page);

    await expect(page.getByRole("heading", { name: "Admin Access" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to login" })).toBeVisible();

    await page.evaluate((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.getByRole("heading", { name: "Admin Settings" })).toBeVisible();
  });

  test("settings page saves updated values", async ({ page }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/settings");
    await checkA11y(page);

    const bonus = page
      .locator("label")
      .filter({ hasText: "First completion bonus" })
      .getByRole("spinbutton");

    await bonus.fill("42");
    await page.getByRole("button", { name: "Save Settings" }).click();

    await expect(page.getByText("Settings saved.")).toBeVisible();

    const keyInput = page.getByLabel("Connection test API key (write-only)");
    await expect(keyInput).toHaveValue("");

    await keyInput.fill("temporary-key");
    await page.getByRole("button", { name: "Test AI Connection" }).click();

    await expect(page.getByText("Connection test succeeded.")).toBeVisible();
    await expect(keyInput).toHaveValue("");
  });

  test("packages page can set hidden then available", async ({ page }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/packages");
    await checkA11y(page);

    await expect(page.getByRole("heading", { name: "Admin Packages" })).toBeVisible();
    const availabilityControl = page.getByLabel("Availability");
    await availabilityControl.selectOption("hidden");
    await expect(availabilityControl).toHaveValue("hidden");

    await availabilityControl.selectOption("available");
    await expect(availabilityControl).toHaveValue("available");
  });

  test("packages page can set unavailable", async ({ page }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/packages");
    await checkA11y(page);

    const availabilityControl = page.getByLabel("Availability");
    await availabilityControl.selectOption("unavailable");
    await expect(availabilityControl).toHaveValue("unavailable");
  });
});
