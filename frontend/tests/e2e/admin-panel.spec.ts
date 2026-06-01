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
  {
    id: "sample-demo-two",
    title: "Second Demo",
    description: "Second demo package",
    version: "1.0.0",
    tags: ["demo"],
    passing_score: 0.8,
    page_count: 2,
    question_count: 5,
    availability: "available",
    enabled: true,
    xp_threshold: null,
  },
];

const LESSON_PACKAGE_TEMPLATE = {
  id: "sample-demo",
  title: "Sample Demo",
  description: "Demo package",
  version: "1.0.0",
  tags: ["demo"],
  passing_score: 0.75,
  pages: [
    {
      id: "p1",
      title: "Demo Intro",
      content: "Demo package intro content.",
    },
    {
      id: "p2",
      title: "Demo Follow-up",
      content: "Demo package follow-up content.",
    },
  ],
  questions: [
    {
      id: "q1",
      text: "Question 1",
      answers: [
        { id: "a1", text: "Correct" },
        { id: "a2", text: "Incorrect" },
      ],
      correct_answer: "a1",
      weight: 0.25,
      feedback: "Correct",
      revision_page_ids: [],
    },
    {
      id: "q2",
      text: "Question 2",
      answers: [
        { id: "b1", text: "Correct" },
        { id: "b2", text: "Incorrect" },
      ],
      correct_answer: "b1",
      weight: 0.25,
      feedback: "Correct",
      revision_page_ids: [],
    },
    {
      id: "q3",
      text: "Question 3",
      answers: [
        { id: "c1", text: "Correct" },
        { id: "c2", text: "Incorrect" },
      ],
      correct_answer: "c1",
      weight: 0.25,
      feedback: "Correct",
      revision_page_ids: [],
    },
    {
      id: "q4",
      text: "Question 4",
      answers: [
        { id: "d1", text: "Correct" },
        { id: "d2", text: "Incorrect" },
      ],
      correct_answer: "d1",
      weight: 0.25,
      feedback: "Correct",
      revision_page_ids: [],
    },
  ],
};

const ADMIN_USERS = [
  {
    id: 999,
    username: "admin-user",
    email: "admin@example.com",
    role: "admin",
    xp: 200,
    pending_bonus_xp: 0,
    pending_bonus_reason: null,
    created_at: "2026-05-30T00:00:00Z",
  },
  {
    id: 1000,
    username: "learner-user",
    email: "learner@example.com",
    role: "student",
    xp: 40,
    pending_bonus_xp: 0,
    pending_bonus_reason: null,
    created_at: "2026-05-30T00:00:00Z",
  },
];

const AI_CONFIG_PAYLOAD = {
  provider: "gemini",
  model: "gemini-2.0-flash-exp",
  key_present: true,
} as const;

const AUDIT_LOGS = [
  {
    id: 20,
    actor_user_id: 999,
    action: "user.role.updated",
    target_user_id: 1000,
    package_id: null,
    details: { role: "admin", previous_role: "student" },
    created_at: "2026-05-30T12:00:00Z",
  },
  {
    id: 19,
    actor_user_id: 999,
    action: "package.archived",
    target_user_id: null,
    package_id: "sample-demo",
    details: { permanent: false },
    created_at: "2026-05-30T11:45:00Z",
  },
  {
    id: 18,
    actor_user_id: 1000,
    action: "settings.updated",
    target_user_id: null,
    package_id: null,
    details: {
      changed_count: 1,
      changed_keys: ["celebration_effects.enabled"],
    },
    created_at: "2026-05-29T10:15:00Z",
  },
] as const;

function isBackendPath(url: URL, path: string): boolean {
  return url.port === "8000" && url.pathname === path;
}

function isBackendSubpath(url: URL, prefix: string): boolean {
  return url.port === "8000" && url.pathname.startsWith(prefix);
}

async function checkA11y(page: import("@playwright/test").Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
}

test.describe("Admin panel", () => {
  let progressResetRequestCount = 0;
  let progressResetWithXPRequestCount = 0;
  let delayedSettingsSaveMs = 0;
  let delayedPackageRefreshMs = 0;
  let failNextTagsSaveRequest = false;
  let tagsPatchPayloads: Array<{ packageId: string; tags: string[] }> = [];

  test.beforeEach(async ({ page }) => {
    progressResetRequestCount = 0;
    progressResetWithXPRequestCount = 0;
    delayedSettingsSaveMs = 0;
    delayedPackageRefreshMs = 0;
    failNextTagsSaveRequest = false;
    tagsPatchPayloads = [];

    let adminSettings = structuredClone(SETTINGS_PAYLOAD);
    let adminPackages = PACKAGE_LIST.map((pkg) => ({ ...pkg }));
    const adminUsers = ADMIN_USERS.map((row) => ({ ...row }));
    const progressRecordCounts: Record<number, number> = {
      999: 0,
      1000: 3,
    };

    await page.route(
      (url) => isBackendPath(url, "/users/me"),
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(ADMIN_USER),
        });
      },
    );

    await page.route(`${API_BASE_URL}/admin/settings`, async (route) => {
      if (route.request().method() === "PUT") {
        adminSettings = route.request().postDataJSON() as typeof SETTINGS_PAYLOAD;
        if (delayedSettingsSaveMs > 0) {
          await new Promise((resolve) => {
            setTimeout(resolve, delayedSettingsSaveMs);
          });
        }
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(adminSettings),
        });
        return;
      }

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(adminSettings),
      });
    });

    await page.route(`${API_BASE_URL}/api/settings`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(adminSettings),
      });
    });

    await page.route(
      (url) => isBackendPath(url, "/packages"),
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            adminPackages.filter((pkg) => pkg.availability !== "hidden"),
          ),
        });
      },
    );

    await page.route(`${API_BASE_URL}/packages/*`, (route) => {
      const packageId = decodeURIComponent(
        new URL(route.request().url()).pathname.split("/").at(-1) ?? "",
      );
      const summary = adminPackages.find((pkg) => pkg.id === packageId);
      if (!summary) {
        route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Package not found" }),
        });
        return;
      }

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...LESSON_PACKAGE_TEMPLATE,
          id: summary.id,
          title: summary.title,
          description: summary.description,
          version: summary.version,
          tags: summary.tags,
          passing_score: summary.passing_score,
        }),
      });
    });

    await page.route(`${API_BASE_URL}/admin/packages`, (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(adminPackages[0]),
        });
        return;
      }

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(adminPackages),
      });
    });

    await page.route(
      (url) => isBackendPath(url, "/admin/users"),
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(adminUsers),
        });
      },
    );

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
          model_used: "gemini-2.0-flash-exp",
        }),
      });
    });

    await page.route(
      (url) => isBackendPath(url, "/admin/audit-logs"),
      (route) => {
        const requestUrl = new URL(route.request().url());
        const limitValue = Number.parseInt(
          requestUrl.searchParams.get("limit") ?? "50",
          10,
        );
        const boundedLimit = Number.isNaN(limitValue)
          ? 50
          : Math.max(1, Math.min(500, limitValue));

        const actionFilter = requestUrl.searchParams.get("action")?.trim();
        const actorFilterValue = Number.parseInt(
          requestUrl.searchParams.get("actor_user_id") ?? "",
          10,
        );
        const fromFilterRaw = requestUrl.searchParams.get("from");
        const untilFilterRaw = requestUrl.searchParams.get("until");
        const fromTimestamp = fromFilterRaw ? Date.parse(fromFilterRaw) : Number.NaN;
        const untilTimestamp = untilFilterRaw ? Date.parse(untilFilterRaw) : Number.NaN;

        let filtered = [...AUDIT_LOGS];
        if (actionFilter && actionFilter.length > 0) {
          filtered = filtered.filter((entry) => entry.action.includes(actionFilter));
        }
        if (Number.isInteger(actorFilterValue) && actorFilterValue > 0) {
          filtered = filtered.filter(
            (entry) => entry.actor_user_id === actorFilterValue,
          );
        }
        if (Number.isFinite(fromTimestamp)) {
          filtered = filtered.filter(
            (entry) => Date.parse(entry.created_at) >= fromTimestamp,
          );
        }
        if (Number.isFinite(untilTimestamp)) {
          filtered = filtered.filter(
            (entry) => Date.parse(entry.created_at) <= untilTimestamp,
          );
        }

        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(filtered.slice(0, boundedLimit)),
        });
      },
    );

    await page.route(`${API_BASE_URL}/admin/packages/*/refresh`, async (route) => {
      const packageId = decodeURIComponent(
        new URL(route.request().url()).pathname.split("/").at(-2) ?? "",
      );
      if (delayedPackageRefreshMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, delayedPackageRefreshMs);
        });
      }

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          package_id: packageId || "sample-demo",
          previous_version: "1.0.0",
          new_version: "1.0.1",
          diff_summary: "Updated content",
          dry_run: false,
        }),
      });
    });

    await page.route(`${API_BASE_URL}/admin/packages/*`, async (route) => {
      if (route.request().method() === "DELETE") {
        const url = new URL(route.request().url());
        const packageId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
        const packageIndex = adminPackages.findIndex((pkg) => pkg.id === packageId);
        if (packageIndex < 0) {
          route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ detail: "Package not found" }),
          });
          return;
        }

        const permanent = url.searchParams.get("permanent") === "true";
        const confirm = url.searchParams.get("confirm") === "true";
        if (!permanent) {
          adminPackages[packageIndex] = {
            ...adminPackages[packageIndex],
            availability: "hidden",
            enabled: false,
          };
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              package_id: packageId,
              operation: "archived",
              summary: adminPackages[packageIndex],
            }),
          });
          return;
        }

        if (!confirm) {
          route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({ detail: "confirm=true required" }),
          });
          return;
        }

        if (adminPackages.length <= 1) {
          route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              detail: "Cannot permanently delete the last remaining package",
            }),
          });
          return;
        }

        adminPackages = adminPackages.filter((pkg) => pkg.id !== packageId);
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            package_id: packageId,
            operation: "deleted",
          }),
        });
        return;
      }

      const patch = route.request().postDataJSON() as {
        availability?: "available" | "unavailable" | "hidden";
        enabled?: boolean;
        xp_threshold?: number | null;
        tags?: string[];
      };
      const packageId = decodeURIComponent(
        route.request().url().split("/").at(-1) ?? "",
      );
      const packageIndex = adminPackages.findIndex((pkg) => pkg.id === packageId);
      const currentPackage =
        packageIndex >= 0 ? adminPackages[packageIndex] : adminPackages[0];
      const availability =
        patch.availability ??
        (patch.enabled === undefined
          ? currentPackage.availability
          : patch.enabled
            ? "available"
            : "unavailable");
      const next = {
        ...currentPackage,
        availability,
        enabled: availability === "available",
        tags: patch.tags ?? currentPackage.tags,
        xp_threshold:
          patch.xp_threshold === undefined
            ? currentPackage.xp_threshold
            : patch.xp_threshold,
      };

      if (patch.tags !== undefined) {
        if (failNextTagsSaveRequest) {
          failNextTagsSaveRequest = false;
          route.fulfill({
            status: 422,
            contentType: "application/json",
            body: JSON.stringify({
              detail: "Tag 'security' is reserved for managed packages.",
            }),
          });
          return;
        }

        tagsPatchPayloads.push({
          packageId,
          tags: [...patch.tags],
        });
      }

      if (packageIndex >= 0) {
        adminPackages[packageIndex] = next;
      }

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(next),
      });
    });

    await page.route(
      (url) => isBackendSubpath(url, "/admin/users/"),
      (route) => {
        const method = route.request().method();
        const parts = new URL(route.request().url()).pathname.split("/");
        const userId = Number(parts[parts.indexOf("users") + 1]);
        const rowIndex = adminUsers.findIndex((row) => row.id === userId);

        if (rowIndex < 0) {
          route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ detail: "User not found" }),
          });
          return;
        }

        if (method === "PATCH" && route.request().url().endsWith("/role")) {
          const body = route.request().postDataJSON() as {
            role: "admin" | "student";
          };
          adminUsers[rowIndex] = {
            ...adminUsers[rowIndex],
            role: body.role,
          };
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(adminUsers[rowIndex]),
          });
          return;
        }

        if (method === "PATCH" && route.request().url().endsWith("/xp/set")) {
          const body = route.request().postDataJSON() as { xp: number };
          adminUsers[rowIndex] = {
            ...adminUsers[rowIndex],
            xp: body.xp,
          };
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: adminUsers[rowIndex].id,
              username: adminUsers[rowIndex].username,
              role: adminUsers[rowIndex].role,
              xp: adminUsers[rowIndex].xp,
              pending_bonus_xp: adminUsers[rowIndex].pending_bonus_xp,
              pending_bonus_reason: adminUsers[rowIndex].pending_bonus_reason,
            }),
          });
          return;
        }

        if (method === "POST" && route.request().url().endsWith("/xp/reset")) {
          adminUsers[rowIndex] = {
            ...adminUsers[rowIndex],
            xp: 0,
            pending_bonus_xp: 0,
            pending_bonus_reason: null,
          };
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: adminUsers[rowIndex].id,
              username: adminUsers[rowIndex].username,
              role: adminUsers[rowIndex].role,
              xp: adminUsers[rowIndex].xp,
              pending_bonus_xp: adminUsers[rowIndex].pending_bonus_xp,
              pending_bonus_reason: adminUsers[rowIndex].pending_bonus_reason,
            }),
          });
          return;
        }

        if (method === "POST" && route.request().url().endsWith("/xp/bonus")) {
          const body = route.request().postDataJSON() as {
            xp: number;
            reason: string;
          };
          adminUsers[rowIndex] = {
            ...adminUsers[rowIndex],
            xp: adminUsers[rowIndex].xp + body.xp,
            pending_bonus_xp: body.xp,
            pending_bonus_reason: body.reason,
          };
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: adminUsers[rowIndex].id,
              username: adminUsers[rowIndex].username,
              role: adminUsers[rowIndex].role,
              xp: adminUsers[rowIndex].xp,
              pending_bonus_xp: adminUsers[rowIndex].pending_bonus_xp,
              pending_bonus_reason: adminUsers[rowIndex].pending_bonus_reason,
            }),
          });
          return;
        }

        if (method === "POST" && route.request().url().endsWith("/progress/reset")) {
          const rawBody = route.request().postData();
          const payload = rawBody
            ? (JSON.parse(rawBody) as { reset_xp?: boolean })
            : undefined;
          const shouldResetXP = payload?.reset_xp === true;
          if (shouldResetXP) {
            progressResetWithXPRequestCount += 1;
          } else {
            progressResetRequestCount += 1;
          }
          const clearedProgressCount = progressRecordCounts[userId] ?? 0;
          progressRecordCounts[userId] = 0;

          adminUsers[rowIndex] = {
            ...adminUsers[rowIndex],
            xp: shouldResetXP ? 0 : adminUsers[rowIndex].xp,
            pending_bonus_xp: shouldResetXP ? 0 : adminUsers[rowIndex].pending_bonus_xp,
            pending_bonus_reason: shouldResetXP
              ? null
              : adminUsers[rowIndex].pending_bonus_reason,
          };

          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: adminUsers[rowIndex].id,
              username: adminUsers[rowIndex].username,
              role: adminUsers[rowIndex].role,
              xp: adminUsers[rowIndex].xp,
              pending_bonus_xp: adminUsers[rowIndex].pending_bonus_xp,
              pending_bonus_reason: adminUsers[rowIndex].pending_bonus_reason,
              cleared_progress_count: clearedProgressCount,
              reset_xp: shouldResetXP,
            }),
          });
          return;
        }

        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Unhandled admin user request" }),
        });
      },
    );
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

    const celebrationEnabled = page.getByLabel("Enabled").first();
    const lightningOnStreakMilestones = page
      .getByLabel("Lightning on streak milestones")
      .first();
    const respectReducedMotion = page.getByLabel("Respect reduced motion").first();

    await expect(celebrationEnabled).not.toBeChecked();
    await expect(lightningOnStreakMilestones).toBeChecked();
    await expect(respectReducedMotion).toBeChecked();

    await celebrationEnabled.check();
    await lightningOnStreakMilestones.uncheck();
    await respectReducedMotion.uncheck();

    await page.getByRole("button", { name: "Save Settings" }).click();

    await expect(page.getByText("Settings saved.")).toBeVisible();
    await expect(celebrationEnabled).toBeChecked();
    await expect(lightningOnStreakMilestones).not.toBeChecked();
    await expect(respectReducedMotion).not.toBeChecked();

    await page.reload();

    await expect(page.getByRole("heading", { name: "Admin Settings" })).toBeVisible();
    await expect(celebrationEnabled).toBeChecked();
    await expect(lightningOnStreakMilestones).not.toBeChecked();
    await expect(respectReducedMotion).not.toBeChecked();
    await expect(bonus).toHaveValue("42");

    const keyInput = page.getByLabel("Connection test API key (write-only)");
    await expect(keyInput).toHaveValue("");

    await keyInput.fill("temporary-key");
    await page.getByRole("button", { name: "Test AI Connection" }).click();

    await expect(page.getByText("Connection test succeeded.")).toBeVisible();
    await expect(page.getByText("Model tested: gemini-2.0-flash-exp.")).toBeVisible();
    await expect(keyInput).toHaveValue("");
  });

  test("settings page shows friendly AI connection failure copy without provider blobs", async ({
    page,
  }) => {
    await page.route(`${API_BASE_URL}/admin/ai-config/test`, (route) => {
      route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({
          error_code: "ai_provider_failed",
          message: "Provider connection failed.",
          detail: {
            provider_status: "UNAVAILABLE",
            raw_response: '{"status":"UNAVAILABLE"}',
          },
        }),
      });
    });

    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/settings");

    const keyInput = page.getByLabel("Connection test API key (write-only)");
    await keyInput.fill("temporary-key");
    await page.getByRole("button", { name: "Test AI Connection" }).click();

    await expect(
      page.getByText(
        "Could not run AI connection test. Check provider, model, and API key.",
      ),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("provider_status");
    await expect(page.locator("body")).not.toContainText("raw_response");
    await expect(page.locator("body")).not.toContainText("UNAVAILABLE");
  });

  test("admin celebration lightning setting propagates to learner streak milestone", async ({
    page,
  }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    const runLessonToThreeCorrect = async (packageId: string) => {
      await page.goto(`/packages/${packageId}`);
      const skipToQuestions = page.getByRole("button", {
        name: /Skip to Questions/i,
      });
      await expect(skipToQuestions).toBeVisible();
      await skipToQuestions.click();

      for (let index = 0; index < 3; index++) {
        await page.locator(".question-view__answer").first().click();
        await page.getByRole("button", { name: "Next" }).click();
      }

      await expect(page.locator(".streak-badge")).toHaveAttribute(
        "aria-label",
        "Streak: 3 correct in a row",
      );
    };

    await page.goto("/admin/settings");

    const celebrationEnabled = page.getByLabel("Enabled").first();
    const lightningOnStreakMilestones = page
      .getByLabel("Lightning on streak milestones")
      .first();

    await celebrationEnabled.check();
    await lightningOnStreakMilestones.uncheck();
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    await runLessonToThreeCorrect(PACKAGE_LIST[0].id);
    await expect(page.locator(".streak-badge--lightning")).toHaveCount(0);

    await page.goto("/admin/settings");
    await lightningOnStreakMilestones.check();
    await page.getByRole("button", { name: "Save Settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    await runLessonToThreeCorrect(PACKAGE_LIST[1].id);
    await expect
      .poll(async () => page.locator(".streak-badge--lightning").count(), {
        timeout: 2_000,
      })
      .toBeGreaterThan(0);
  });

  test("settings page previews celebration effects deterministically", async ({
    page,
  }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/admin/settings");
    await checkA11y(page);

    const previewConfettiButton = page.getByRole("button", {
      name: "Preview confetti",
    });
    const previewLightningButton = page.getByRole("button", {
      name: "Preview lightning",
    });
    const previewStatus = page.getByTestId("celebration-preview-status");
    const lightningPreview = page.getByTestId("celebration-lightning-preview");

    await expect(previewConfettiButton).toBeVisible();
    await expect(previewLightningButton).toBeVisible();
    await expect(lightningPreview).toHaveAttribute("data-state", "idle");

    await previewConfettiButton.click();
    await expect(previewStatus).toContainText(
      "Confetti preview skipped because reduced motion is active.",
    );

    const celebrationEnabled = page.getByLabel("Enabled").first();
    const respectReducedMotion = page.getByLabel("Respect reduced motion").first();

    await celebrationEnabled.check();
    await previewLightningButton.click();
    await expect(previewStatus).toContainText(
      "Lightning preview skipped because reduced motion is active.",
    );
    await expect(lightningPreview).toHaveAttribute("data-state", "idle");

    await respectReducedMotion.uncheck();
    await previewLightningButton.click();
    await expect(previewStatus).toContainText("Lightning preview active.");
    await expect(lightningPreview).toHaveAttribute("data-state", "active");

    await previewConfettiButton.click();
    await expect(previewStatus).toContainText("Confetti preview requested.");
  });

  test("packages page can set hidden then available", async ({ page }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/packages");
    await checkA11y(page);

    await expect(page.getByRole("heading", { name: "Admin Packages" })).toBeVisible();
    const availabilityControl = page.getByLabel("Availability").first();
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

    const availabilityControl = page.getByLabel("Availability").first();
    await availabilityControl.selectOption("unavailable");
    await expect(availabilityControl).toHaveValue("unavailable");
  });

  test("packages page saves tags and sends tags payload", async ({ page }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/packages");
    await checkA11y(page);

    const firstPackage = page
      .locator(".admin-page__list-item")
      .filter({ hasText: "Sample Demo" })
      .first();
    const tagsInput = firstPackage.getByLabel("Tags (comma-separated)");

    await expect(tagsInput).toHaveValue("demo");
    await tagsInput.fill("demo, security, security, compliance");
    await firstPackage.getByRole("button", { name: "Save tags" }).click();

    expect(tagsPatchPayloads).toContainEqual({
      packageId: "sample-demo",
      tags: ["demo", "security", "compliance"],
    });
    await expect(page.getByText("Tags updated for 'sample-demo'.")).toBeVisible();
    await expect(tagsInput).toHaveValue("demo, security, compliance");
  });

  test("packages page shows backend tag validation failures as alert", async ({
    page,
  }) => {
    failNextTagsSaveRequest = true;

    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/packages");
    await checkA11y(page);

    const firstPackage = page
      .locator(".admin-page__list-item")
      .filter({ hasText: "Sample Demo" })
      .first();
    const tagsInput = firstPackage.getByLabel("Tags (comma-separated)");

    await tagsInput.fill("demo, security");
    await firstPackage.getByRole("button", { name: "Save tags" }).click();

    const errorAlert = page.getByRole("alert").filter({
      hasText: "reserved for managed packages",
    });
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("Failed to update package");
  });

  test("packages page shows friendly toast for AI overload generate errors and hides provider JSON details", async ({
    page,
  }) => {
    await page.route(`${API_BASE_URL}/admin/packages/generate`, (route) => {
      route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error_code: "ai_provider_overloaded",
          message: "Provider request failed due to overload.",
          detail: {
            status_code: 429,
            provider_status: "RESOURCE_EXHAUSTED",
            retry_after_ms: 3200,
          },
        }),
      });
    });

    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/packages");
    await checkA11y(page);

    await page.getByLabel("Topic").fill("Incident response essentials");
    await page.getByRole("button", { name: "Generate with AI" }).click();

    const toastError = page.getByTestId("toast-error").first();
    await expect(toastError).toBeVisible();
    await expect(toastError).toContainText("Generate failed");
    await expect(toastError).toContainText("AI capacity is high right now.");
    await expect(toastError).toContainText("switch to a lighter model");

    await expect(page.locator("body")).not.toContainText("status_code");
    await expect(page.locator("body")).not.toContainText("RESOURCE_EXHAUSTED");
    await expect(page.locator("body")).not.toContainText("retry_after_ms");
  });

  test("busy buttons show spinner for package and settings actions", async ({
    page,
  }) => {
    delayedPackageRefreshMs = 1_200;
    delayedSettingsSaveMs = 1_200;

    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/packages");

    const firstPackage = page
      .locator(".admin-page__list-item")
      .filter({ hasText: "Sample Demo" })
      .first();
    const refreshButton = firstPackage.getByRole("button", {
      name: "Refresh package",
    });

    const refreshPromise = refreshButton.click();
    await expect(refreshButton).toHaveAttribute("aria-busy", "true");
    await expect(refreshButton.locator(".admin-page__button-spinner")).toBeVisible();
    await refreshPromise;
    await expect(refreshButton).toHaveAttribute("aria-busy", "false");
    await expect(refreshButton.locator(".admin-page__button-spinner")).toHaveCount(0);

    await page.goto("/admin/settings");

    const bonus = page
      .locator("label")
      .filter({ hasText: "First completion bonus" })
      .getByRole("spinbutton");
    await bonus.fill("44");

    const saveSettingsButton = page.getByRole("button", {
      name: "Save Settings",
    });
    const savePromise = saveSettingsButton.click();
    await expect(saveSettingsButton).toHaveAttribute("aria-busy", "true");
    await expect(
      saveSettingsButton.locator(".admin-page__button-spinner"),
    ).toBeVisible();
    await savePromise;
    await expect(saveSettingsButton).toHaveAttribute("aria-busy", "false");
    await expect(saveSettingsButton.locator(".admin-page__button-spinner")).toHaveCount(
      0,
    );
  });

  test("leave warning appears during in-flight package action", async ({ page }) => {
    delayedPackageRefreshMs = 2_000;

    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/packages");

    const firstPackage = page
      .locator(".admin-page__list-item")
      .filter({ hasText: "Sample Demo" })
      .first();
    const refreshButton = firstPackage.getByRole("button", {
      name: "Refresh package",
    });

    await refreshButton.click();
    await expect(refreshButton).toHaveAttribute("aria-busy", "true");

    let dismissedDialogMessage = "";
    page.once("dialog", async (dialog) => {
      dismissedDialogMessage = dialog.message();
      await dialog.dismiss();
    });

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect
      .poll(() => dismissedDialogMessage)
      .toContain("An admin action is still running.");
    await expect(page).toHaveURL(/\/admin\/packages/);

    let acceptedDialogMessage = "";
    page.once("dialog", async (dialog) => {
      acceptedDialogMessage = dialog.message();
      await dialog.accept();
    });

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect
      .poll(() => acceptedDialogMessage)
      .toContain("An admin action is still running.");
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.getByRole("heading", { name: "Admin Settings" })).toBeVisible();
  });

  test("shows persisted completion notice after leaving during in-flight package refresh", async ({
    page,
  }) => {
    delayedPackageRefreshMs = 2_000;

    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/packages");

    const firstPackage = page
      .locator(".admin-page__list-item")
      .filter({ hasText: "Sample Demo" })
      .first();
    const refreshButton = firstPackage.getByRole("button", {
      name: "Refresh package",
    });

    await refreshButton.click();
    await expect(refreshButton).toHaveAttribute("aria-busy", "true");

    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.getByRole("heading", { name: "Admin Settings" })).toBeVisible();

    const persistedNotice = page.getByTestId("admin-persisted-task-notice");
    await expect(persistedNotice).toHaveText("sample-demo refreshed: 1.0.0 -> 1.0.1");

    await page.getByRole("link", { name: "Packages", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/packages/);
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.getByTestId("admin-persisted-task-notice")).toHaveCount(0);
  });

  test("users page can set, reset, and grant bonus XP", async ({ page }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/settings");
    await page.getByRole("link", { name: "Users", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Admin Users" })).toBeVisible();
    await checkA11y(page);

    const userCard = page
      .locator(".admin-page__list-item")
      .filter({ hasText: "learner-user" });

    await userCard.getByLabel("Set XP").fill("120");
    await userCard.getByRole("button", { name: "Set XP", exact: true }).click();
    await expect(userCard).toContainText("XP set to 120.");
    await expect(userCard).toContainText("Current XP: 120");

    await userCard.getByLabel("Bonus XP").fill("25");
    await userCard.getByLabel("Bonus reason").fill("Excellent mentoring");
    await userCard.getByRole("button", { name: "Grant bonus XP" }).click();
    await expect(userCard).toContainText("Bonus XP granted: +25.");
    await expect(userCard).toContainText("Current XP: 145");
    await expect(userCard).toContainText("Pending bonus: +25 (Excellent mentoring)");

    await userCard.getByRole("button", { name: "Reset XP", exact: true }).click();
    await expect(userCard).toContainText("XP reset to 0 and pending bonus cleared.");
    await expect(userCard).toContainText("Current XP: 0");

    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain(
        "This will permanently reset all saved learning progress for learner-user.",
      );
      expect(dialog.message()).toContain("XP will remain at 0.");
      expect(dialog.message()).toContain("This action cannot be undone.");
      void dialog.dismiss();
    });
    await userCard
      .getByRole("button", {
        name: "Reset all progress (irreversible)",
        exact: true,
      })
      .click();
    expect(progressResetRequestCount).toBe(0);

    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain(
        "This will permanently reset all saved learning progress for learner-user.",
      );
      expect(dialog.message()).toContain("XP will remain at 0.");
      expect(dialog.message()).toContain("This action cannot be undone.");
      void dialog.accept();
    });
    await userCard
      .getByRole("button", {
        name: "Reset all progress (irreversible)",
        exact: true,
      })
      .click();
    expect(progressResetRequestCount).toBe(1);
    await expect(userCard).toContainText("Progress reset. Cleared 3 package records.");

    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain(
        "This will permanently reset all saved learning progress and set XP to 0 for learner-user.",
      );
      expect(dialog.message()).toContain("This action cannot be undone.");
      void dialog.dismiss();
    });
    await userCard
      .getByRole("button", {
        name: "Reset all progress and XP (irreversible)",
        exact: true,
      })
      .click();
    expect(progressResetWithXPRequestCount).toBe(0);

    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain(
        "This will permanently reset all saved learning progress and set XP to 0 for learner-user.",
      );
      expect(dialog.message()).toContain("This action cannot be undone.");
      void dialog.accept();
    });
    await userCard
      .getByRole("button", {
        name: "Reset all progress and XP (irreversible)",
        exact: true,
      })
      .click();
    expect(progressResetWithXPRequestCount).toBe(1);
    await expect(userCard).toContainText(
      "Progress and XP reset. Cleared 0 package records.",
    );
    await expect(userCard).toContainText("Current XP: 0");
  });

  test("audit logs page lists recent events", async ({ page }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/settings");
    await page.getByRole("link", { name: "Audit Logs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Admin Audit Logs" })).toBeVisible();
    await checkA11y(page);

    await expect(page.getByRole("columnheader", { name: "Timestamp" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "user.role.updated" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "999" }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "user 1000" })).toBeVisible();
    await expect(
      page.getByRole("cell", { name: /role=admin, previous_role=student/ }),
    ).toBeVisible();
  });

  test("audit logs page applies and resets filters", async ({ page }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/audit-logs");
    await expect(page.getByRole("heading", { name: "Admin Audit Logs" })).toBeVisible();

    await page.getByLabel("Action contains").fill("settings");
    await page.getByLabel("Actor user ID").fill("1000");
    await page.getByLabel("From date").fill("2026-05-29");
    await page.getByLabel("Until date").fill("2026-05-29");
    await page.getByRole("button", { name: "Apply filters" }).click();

    await expect(page.getByRole("cell", { name: "settings.updated" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "1000" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "package.archived" })).toHaveCount(0);

    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(page.getByRole("cell", { name: "package.archived" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "user.role.updated" })).toBeVisible();
  });

  test("packages page can archive and permanently delete", async ({ page }) => {
    await page.addInitScript((token) => {
      sessionStorage.setItem("lle_auth_token", token);
    }, AUTH_TOKEN);

    await page.goto("/admin/packages");
    await checkA11y(page);

    const firstPackage = page
      .locator(".admin-page__list-item")
      .filter({ hasText: "Sample Demo" })
      .first();

    await firstPackage.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Package 'sample-demo' archived.")).toBeVisible();
    await expect(firstPackage.getByLabel("Availability")).toHaveValue("hidden");

    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    await firstPackage.getByRole("button", { name: "Delete permanently" }).click();

    await expect(
      page.getByText("Package 'sample-demo' permanently deleted."),
    ).toBeVisible();
    await expect(page.getByText("Sample Demo")).toHaveCount(0);
  });
});
