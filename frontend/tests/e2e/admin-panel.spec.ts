import { expect, test } from "@playwright/test";

const API_BASE_URL = "http://localhost:8000";
const ADMIN_TOKEN = "admin-secret";

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
    enabled: true,
    xp_threshold: null,
  },
];

test.describe("Admin panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${API_BASE_URL}/admin/settings`, (route) => {
      const token = route.request().headers()["x-admin-token"];
      if (token !== ADMIN_TOKEN) {
        route.fulfill({ status: 401, body: "unauthorised" });
        return;
      }

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

    await page.route(`${API_BASE_URL}/admin/packages/*`, (route) => {
      const patch = route.request().postDataJSON() as {
        enabled?: boolean;
        xp_threshold?: number | null;
      };
      const next = {
        ...PACKAGE_LIST[0],
        enabled: patch.enabled ?? PACKAGE_LIST[0].enabled,
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

  test("admin token gate rejects invalid value then accepts valid token", async ({
    page,
  }) => {
    await page.goto("/admin");

    await page.getByLabel("Admin token").fill("bad-token");
    await page.getByRole("button", { name: "Enter Admin" }).click();
    await expect(page.getByText(/Token rejected/i)).toBeVisible();

    await page.getByLabel("Admin token").fill(ADMIN_TOKEN);
    await page.getByRole("button", { name: "Enter Admin" }).click();

    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.getByRole("heading", { name: "Admin Settings" })).toBeVisible();
  });

  test("settings page saves updated values", async ({ page }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_admin_token", token);
    }, ADMIN_TOKEN);

    await page.goto("/admin/settings");

    const bonus = page
      .locator("label")
      .filter({ hasText: "First completion bonus" })
      .getByRole("spinbutton");

    await bonus.fill("42");
    await page.getByRole("button", { name: "Save Settings" }).click();

    await expect(page.getByText("Settings saved.")).toBeVisible();
  });

  test("packages page toggles enabled state", async ({ page }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_admin_token", token);
    }, ADMIN_TOKEN);

    await page.goto("/admin/packages");

    await expect(page.getByRole("heading", { name: "Admin Packages" })).toBeVisible();
    await page.getByRole("button", { name: "Disable" }).click();
    await expect(page.getByRole("button", { name: "Enable" })).toBeVisible();
  });
});
