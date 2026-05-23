import { expect, test, type Page } from "@playwright/test";

const MOCK_PACKAGES = [
  {
    id: "python-basics",
    title: "Python Basics",
    description: "Learn Python fundamentals.",
    version: "1.0.0",
    tags: ["python", "beginner"],
    passing_score: 0.75,
    page_count: 3,
    question_count: 4,
  },
];

test.describe("Package Selection Screen", () => {
  const packageTitle = MOCK_PACKAGES[0].title;

  const getPackageCard = (page: Page, title: string) =>
    page
      .locator("article.package-card")
      .filter({ has: page.getByRole("heading", { name: new RegExp(title, "i") }) });

  test.beforeEach(async ({ page }) => {
    // Default mock: backend returns one package.
    await page.route("**/packages", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PACKAGES),
      });
    });
  });

  test("heading is visible", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Local Learning Engine" }),
    ).toBeVisible();
  });

  test("renders a package card for each mocked package", async ({ page }) => {
    await page.goto("/");
    const card = getPackageCard(page, packageTitle);
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Start Learning" })).toBeVisible();
    await expect(card.getByRole("button", { name: "Take Test" })).toBeVisible();
  });

  test("card shows page and question counts", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("3 pages")).toBeVisible();
    await expect(page.getByText("4 questions")).toBeVisible();
  });

  test("clicking a card navigates to the package detail URL", async ({
    page,
  }) => {
    await page.goto("/");
    const card = getPackageCard(page, packageTitle);
    await card.getByRole("button", { name: "Start Learning" }).click();
    await expect(page).toHaveURL(/\/packages\/python-basics/);
  });

  test("shows error state when backend returns 500", async ({ page }) => {
    await page.unrouteAll({ behavior: "wait" });
    await page.route("**/packages", (route) => {
      route.fulfill({ status: 500, body: "Internal Server Error" });
    });
    await page.goto("/");
    await expect(page.getByText(/Could not load packages/i)).toBeVisible();
  });

  test("shows empty state when backend returns empty array", async ({
    page,
  }) => {
    await page.unrouteAll({ behavior: "wait" });
    await page.route("**/packages", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
    await page.goto("/");
    await expect(page.getByText("No packages available.")).toBeVisible();
  });
});
