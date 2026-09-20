import { expect, test, type APIRequestContext } from "@playwright/test";

async function completeOnboarding(request: APIRequestContext): Promise<void> {
  const response = await request.patch("/api/users/me", {
    data: { name: "E2E Operator" },
  });
  expect(response.ok()).toBe(true);
}

test("public marketing home loads", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Never miss a service date again." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Get started" }).first()).toBeVisible();
});

test("authenticated app shell loads through the real API", async ({ page, request }) => {
  await completeOnboarding(request);
  await page.goto("/app/assets");

  await expect(page).toHaveURL(/\/app\/assets$/);
  await expect(page.getByRole("heading", { name: "Assets", exact: true })).toBeVisible();
});

test("created equipment appears in the asset library", async ({ page, request }) => {
  await completeOnboarding(request);
  await page.goto("/app/assets/new");

  await page.getByRole("radio", { name: /Equipment/ }).click();
  await page.locator('input[placeholder="Pressure washer"]').fill("E2E Generator");
  await page.getByRole("button", { name: "Save asset" }).click();

  await expect(page).toHaveURL(/\/app\/assets$/);
  await expect(page.getByRole("heading", { name: "Assets", exact: true })).toBeVisible();
  await expect(page.getByText("E2E Generator")).toBeVisible();
});
